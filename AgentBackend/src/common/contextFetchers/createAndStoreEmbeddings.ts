import * as dotenv from "dotenv";
import type { Document } from "@langchain/core/documents";
import { EmbeddingConfig, EmbeddingProvider, EmbeddingManager } from "../ai/EmbeddingManager";
import { VectorStoreConfig, VectorStoreProvider, VectorStoreManager } from "../ai/VectorStoreManager";
import data from "./uniswap_hooks.json";
import { LLLModelConfig, LLMModelManager, LLMProviders } from "../ai/LLMModelManager";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();

// Add colorized logging helpers
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warning: (msg: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  debug: (msg: string) => console.log(`\x1b[90m[DEBUG]\x1b[0m ${msg}`),
};

log.info(`Loaded ${(data as any[]).length} hooks from uniswap_hooks.json`);

const embeddingConfig: EmbeddingConfig = {
    provider: EmbeddingProvider.OPENAI,
    apiKey: process.env.OPENAI_API_KEY || '',
    modelName: "text-embedding-3-large",
  };


  const modelConfig: LLLModelConfig = {
    provider: LLMProviders.ANTHROPIC,
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelName: "claude-3-5-sonnet-20240620",
  };

const vectorStoreConfig: VectorStoreConfig = {
    provider: VectorStoreProvider.PGVECTOR,
    connectionConfig: {
      postgresConnectionOptions: {
        type: "postgres",
        host: "127.0.0.1",
        port: 5432,
        user: "test",
        password: "test",
        database: "api",
      },
      tableName: "uniswap_hooks",
    },
  };

const embedder = EmbeddingManager.getInstance(embeddingConfig);
const vectorStore = new VectorStoreManager(vectorStoreConfig, embedder.getEmbedder());



const createAndStoreEmbeddings = async () => {
    const startTime = Date.now();
    log.info("Starting embedding creation process...");
    
    const validItems = (data as any[]).filter((item) => item.sourceCode && item.contractDescription);
    log.info(`Processing ${validItems.length} contracts with source code`);
    
    const documents: Document[] = [];
    let processed = 0;
    let skipped = 0;
    
    // Function to save data to JSON file
    const saveDataToFile = () => {
        try {
            const filePath = path.resolve(__dirname, './uniswap_hooks.json');
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            log.success('Saved progress to uniswap_hooks.json');
        } catch (error) {
            log.error(`Failed to save progress to uniswap_hooks.json: ${error}`);
        }
    };
    
    // Maximum tokens for Claude prompt (leaving room for the prompt itself)
    const MAX_TOKENS = 190000;
    // Estimate: ~4 chars per token as a rough approximation
    const CHARS_PER_TOKEN = 3;
    const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;
    
    for (const item of validItems) {
        const processingStart = Date.now();
        log.info(`Processing contract: ${item.name} (${processed + 1}/${validItems.length})`);
        
        try {
            // Check if description already exists
            if (item.contractDescription) {
                log.info(`Description already exists for ${item.name}, skipping LLM call`);
                skipped++;
                
                documents.push({
                    pageContent: item.contractDescription,
                    metadata: {
                        name: item.name,
                    },
                });
                
                processed++;
                continue;
            }
            
            let sourceCode = item.sourceCode;

            log.info("Source Code Length: " + sourceCode.length);
            log.info("Source Code Token Length: " + Math.round(sourceCode.length/CHARS_PER_TOKEN));
            // Truncate source code if it's too large
            if (sourceCode.length > MAX_CHARS) {
                log.warning(`Source code for ${item.name} is too large (${sourceCode.length} chars, ~${Math.round(sourceCode.length/CHARS_PER_TOKEN)} tokens). Truncating to ~${MAX_TOKENS} tokens.`);
                sourceCode = sourceCode.substring(0, MAX_CHARS) + "\n\n// [Source code truncated due to token limit]";
            }
            
            const llm = LLMModelManager.getInstance(modelConfig);

            log.debug("Generating contract description using Claude...");
            const promptTemplate = ChatPromptTemplate.fromTemplate(
                `
                You are tasked with extracting and analyzing the Uniswap hook code from a larger source code. This analysis will be used for vector search and context generation for future hook creation. Follow these steps:

1. Extract the Uniswap hook code:
   Review the following source code and identify the specific section that contains the Uniswap hook code:
   <sourceCode>
   {sourceCode}
   </sourceCode>
   
   Extract only the relevant Uniswap hook code, ensuring it is clean, short, and precise.

2. Analyze the extracted hook code:
   - Examine the structure and functionality of the code
   - Identify key components and their purposes
   - Determine the main features and capabilities of the hook

3. Prepare an analysis of the hook code, including:
   - A brief description of the hook's purpose and functionality
   - Potential uses and applications of the hook
   - Any notable or unique aspects of the implementation
   - Relevant information that could be useful for future hook generation

4. Format your analysis as follows:
   <hook_analysis>
   <extracted_code>
   [Insert the extracted Uniswap hook code here]
   </extracted_code>
   
   <description>
   [Provide a concise description of the hook]
   </description>
   
   <uses>
   [List potential uses and applications]
   </uses>
   
   <additional_info>
   [Include any other relevant information]
   </additional_info>
   </hook_analysis>

5. Keep your analysis concise and focused on the most relevant information for future hook generation and vector search purposes.

6. Your final output should consist of only the <hook_analysis> section, containing the extracted code, description, uses, and additional information. Do not include any other text or explanations outside of these tags.
                `
            );

            const chain = promptTemplate.pipe(llm.getModel()).pipe(new StringOutputParser());
            const result = await chain.invoke({ sourceCode });
            
            log.debug(`Generated description (${result.length} chars)`);
            log.info(item.contractAddress + " Description: " + result);
            
            // Store the description back in the data
            item.contractDescription = result;
            
            // Save progress after each successful description generation
            saveDataToFile();
            
            documents.push({
                pageContent: result,
                metadata: {
                    name: item.name,
                },
            });
            
            processed++;
            const processingTime = ((Date.now() - processingStart) / 1000).toFixed(2);
            log.success(`Processed ${item.name} in ${processingTime}s`);
        } catch (error) {
            log.error(`Failed to process ${item.name}: ${error}`);
        }
    }

    log.info(`Successfully processed ${documents.length}/${validItems.length} contracts (${skipped} skipped with existing descriptions)`);
    
    try {
        log.info("Storing documents in vector database...");
        
        // Chunk documents to stay within OpenAI's token limits
        // OpenAI limit is 600,000 tokens per request, but we'll use a more conservative limit
        const BATCH_SIZE = 1; // Adjust this based on your document sizes
        const totalBatches = Math.ceil(documents.length / BATCH_SIZE);
        
        log.info(`Splitting ${documents.length} documents into ${totalBatches} batches of ~${BATCH_SIZE} documents each`);
        
        await vectorStore.init();
        
        // Process documents in batches
        for (let i = 0; i < documents.length; i += BATCH_SIZE) {
            const batchStart = i;
            const batchEnd = Math.min(i + BATCH_SIZE, documents.length);
            const batch = documents.slice(batchStart, batchEnd);
            
            log.info(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${totalBatches} (documents ${batchStart+1}-${batchEnd})`);
            
            try {
                await vectorStore.getVectorStore().addDocuments(batch);
                log.success(`Successfully stored batch ${Math.floor(i/BATCH_SIZE) + 1}/${totalBatches}`);
                
                // Add a small delay between batches to avoid rate limiting
                if (i + BATCH_SIZE < documents.length) {
                    log.info("Waiting briefly before processing next batch...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                log.error(`Failed to store batch ${Math.floor(i/BATCH_SIZE) + 1}/${totalBatches}: ${error}`);
                // Continue with next batch despite errors
            }
        }
        
        log.success("Successfully stored all document batches in vector database");
    } catch (error) {
        log.error(`Failed to initialize vector store: ${error}`);
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    log.success(`Embedding creation completed in ${totalTime}s`);
}

log.info("Initializing embedding creation process...");
createAndStoreEmbeddings().then(() => {
    log.success("Process completed successfully");
}).catch((error) => {
    log.error(`Process failed: ${error}`);
});









