import * as dotenv from "dotenv";
import puppeteer from "puppeteer";
import axios from "axios";
import fs from "fs";
import { VectorStoreConfig, VectorStoreManager, VectorStoreProvider } from "../ai/VectorStoreManager";
import { EmbeddingConfig, EmbeddingManager, EmbeddingProvider } from "../ai/EmbeddingManager";

dotenv.config();

interface ExplorerConfig {
  name: string;
  api: string;
  key: string;
}

interface HookData {
  name: string;
  contractAddress: string;
  chainId: number;
  sourceCode?: string | null;
  proxyAddress?: string | null;
}


// Mapping of chain IDs to explorers and API keys
const explorers: Record<number, ExplorerConfig> = {
  1: { name: "Ethereum", api: "https://api.etherscan.io/api", key: process.env.ETHERSCAN_API_KEY || "" },
  137: { name: "Polygon", api: "https://api.polygonscan.com/api", key: process.env.POLYGONSCAN_API_KEY || "" },
  8453: { name: "Base", api: "https://api.basescan.org/api", key: process.env.BASESCAN_API_KEY || "" },
  42161: { name: "Arbitrum", api: "https://api.arbiscan.io/api", key: process.env.ARBISCAN_API_KEY || "" },
};

// Function to scrape HookRank for contract addresses
async function scrapeHookRank(): Promise<HookData[]> {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  
  try {
    console.log("Navigating to HookRank...");
    await page.goto("https://hookrank.io/", { waitUntil: "networkidle0" });
    
    // Wait for content to be fully loaded
    await page.waitForSelector('a[href^="/"]', { timeout: 10000 })
      .catch(() => console.log("Selector timeout - trying to continue anyway"));
    
    // More aggressive scrolling to load all content
    console.log("Starting aggressive scrolling to load all content...");
    
    // First, get the current count of items to establish a baseline
    let previousCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href^="/"][href*="/0x"]').length;
    });
    
    console.log(`Initial hook count: ${previousCount}`);
    
    // Track consecutive times with no change to detect end of content
    let unchangedCount = 0;
    const maxUnchanged = 5; // Break after 5 scrolls with no new content
    let totalScrolls = 0;
    const maxTotalScrolls = 100; // Hard limit on total scrolls
    
    // Scroll in chunks to ensure all content loads
    while (unchangedCount < maxUnchanged && totalScrolls < maxTotalScrolls) {
      totalScrolls++;
      
      // Scroll down in smaller chunks to ensure content loads
      await page.evaluate(() => {
        window.scrollBy(0, 1000); // Scroll by 1000px at a time
      });
      
      // Wait longer for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check current item count
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href^="/"][href*="/0x"]').length;
      });
      
      console.log(`Scroll #${totalScrolls}: Previous count: ${previousCount}, Current count: ${currentCount}`);
      
      // If no new items, increment unchanged counter
      if (currentCount === previousCount) {
        unchangedCount++;
        console.log(`No new hooks loaded (${unchangedCount}/${maxUnchanged})`);
      } else {
        // Reset counter if we found new items
        unchangedCount = 0;
        previousCount = currentCount;
      }
      
      // Every 5 scrolls, try a full scroll to bottom as well
      if (totalScrolls % 5 === 0) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log("Extracting hook data...");
    const hooks: HookData[] = await page.evaluate(() => {
      // Use a more specific selector to target only hook links
      const hookElements = Array.from(document.querySelectorAll('a[href^="/"][href*="/0x"]'));
      console.log(`Found ${hookElements.length} potential hook elements`);
      
      return hookElements.map((el) => {
        const href = el.getAttribute("href") || "";
        const match = href.match(/^\/(\d+)\/(0x[a-fA-F0-9]{40})$/);
        const name = el.querySelector("span")?.textContent?.trim() || "Unknown Hook";

        if (match) {
          return {
            name,
            chainId: parseInt(match[1], 10),
            contractAddress: match[2],
          };
        }
        return null;
      }).filter(Boolean) as any[];
    });

    console.log(`Scraped ${hooks.length} hooks`);
    return hooks;
  } catch (error) {
    console.error("Error during scraping:", error);
    return [];
  } finally {
    await browser.close();
  }
}

// Comment out or remove the direct call
// scrapeHookRank().then((hooks) => {
//   console.log(hooks);
// }); 

// Function to get implementation address if contract is a proxy
async function getImplementationAddressIfProxy(contractAddress: string, chainId: number): Promise<string | null> {
  const explorer = explorers[chainId];
  if (!explorer || !explorer.key) {
    console.log(`No explorer config found for chain ${chainId}`);
    return null;
  }

  try {
    console.log(`Checking if ${contractAddress} is a proxy on ${explorer.name}...`);
    const url = `${explorer.api}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${explorer.key}`;
    console.log(`Making API request to: ${explorer.api}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=***`);
    
    const response = await axios.get(url);
    console.log(`Received response with status: ${response.status}`);
    
    const contractInfo = response.data.result[0];
    console.log(`Contract info for ${contractAddress}:`);
    console.log(`- Proxy status: ${contractInfo?.Proxy}`);
    console.log(`- Has implementation: ${!!contractInfo?.Implementation}`);
    
    // Check if contract is a proxy
    if (contractInfo?.Proxy === "1" && contractInfo?.Implementation) {
      console.log(`✅ ${contractAddress} is a proxy! Implementation address: ${contractInfo.Implementation}`);
      return contractInfo.Implementation;
    }
    
    console.log(`${contractAddress} is not a proxy contract`);
    return null;
  } catch (error) {
    console.error(`❌ Error checking proxy status for ${contractAddress} on ${explorer.name}:`, error);
    return null;
  }
}

// Function to fetch contract source code from block explorers
async function getContractSourceCode(contractAddress: string, chainId: number): Promise<string | null> {
  const explorer = explorers[chainId];
  if (!explorer || !explorer.key) {
    console.log(`No explorer config found for chain ${chainId}`);
    return null;
  }

  try {
    console.log(`Fetching source code for ${contractAddress} on ${explorer.name}...`);
    const url = `${explorer.api}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${explorer.key}`;
    console.log(`Making API request to: ${explorer.api}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=***`);
    
    const response = await axios.get(url);
    console.log(`Received response with status: ${response.status}`);
    
    const contractInfo = response.data.result[0];
    let sourceCode = contractInfo?.SourceCode;
    
    // Check if source code exists
    if (!sourceCode || sourceCode === "") {
      console.log(`⚠️ No source code found for ${contractAddress}`);
    } else {
      console.log(`Found source code for ${contractAddress} (${sourceCode.length} characters)`);
    }
    
    // Check if this is a proxy contract
    if (contractInfo?.Proxy === "1" && contractInfo?.Implementation) {
      const implementationAddress = contractInfo.Implementation;
      console.log(`📋 Contract ${contractAddress} is a proxy. Fetching implementation at ${implementationAddress}`);
      
      // Fetch the source code of the implementation contract
      const implementationUrl = `${explorer.api}?module=contract&action=getsourcecode&address=${implementationAddress}&apikey=${explorer.key}`;
      console.log(`Making API request to: ${explorer.api}?module=contract&action=getsourcecode&address=${implementationAddress}&apikey=***`);
      
      const implementationResponse = await axios.get(implementationUrl);
      console.log(`Received implementation response with status: ${implementationResponse.status}`);
      
      sourceCode = implementationResponse.data.result[0]?.SourceCode;
      
      if (!sourceCode || sourceCode === "") {
        console.log(`⚠️ No source code found for implementation contract ${implementationAddress}`);
      } else {
        console.log(`Found source code for implementation ${implementationAddress} (${sourceCode.length} characters)`);
      }
    }

    return sourceCode && sourceCode !== "" ? sourceCode : null;
  } catch (error) {
    console.error(`❌ Error fetching contract from ${explorer.name}:`, error);
    return null;
  }
}

// Main function to scrape hooks and fetch contract source codes
async function main() {
  console.log("🔍 Scraping HookRank for contract addresses...");
  const hooks = await scrapeHookRank();
  console.log(`✅ Found ${hooks.length} hooks.`);

  let proxiesFound = 0;
  let sourceCodesFound = 0;
  
  console.log("📚 Starting to process hooks and fetch source codes...");
  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i];
    console.log(`\n[Hook ${i+1}/${hooks.length}] Processing ${hook.name} (${hook.contractAddress}) on chain ${hook.chainId}...`);
    
    // Check if it's a proxy contract
    console.log(`Checking if ${hook.contractAddress} is a proxy contract...`);
    const implementationAddress = await getImplementationAddressIfProxy(hook.contractAddress, hook.chainId);
    
    if (implementationAddress) {
      proxiesFound++;
      console.log(`🔄 ${hook.name} is a proxy contract (${proxiesFound} proxies found so far)`);
      console.log(`Original address: ${hook.contractAddress}`);
      console.log(`Implementation address: ${implementationAddress}`);
      
      hook.proxyAddress = hook.contractAddress;
      hook.contractAddress = implementationAddress;
    } else {
      console.log(`${hook.name} is not a proxy contract`);
    }
    
    // Fetch the source code
    console.log(`Fetching source code for ${hook.name} at ${hook.contractAddress}...`);
    hook.sourceCode = await getContractSourceCode(hook.contractAddress, hook.chainId);
    
    if (hook.sourceCode) {
      sourceCodesFound++;
      console.log(`✅ Successfully retrieved source code for ${hook.name} (${sourceCodesFound}/${i+1} source codes found)`);
    } else {
      console.log(`❌ Failed to retrieve source code for ${hook.name}`);
    }
  }

  console.log("\n📊 Summary:");
  console.log(`- Total hooks processed: ${hooks.length}`);
  console.log(`- Proxy contracts found: ${proxiesFound}`);
  console.log(`- Source codes retrieved: ${sourceCodesFound}`);
  
  console.log("\n💾 Saving data to file...");
  fs.writeFileSync("uniswap_hooks.json", JSON.stringify(hooks, null, 2));
  console.log("✅ Data saved to `uniswap_hooks.json`.");
}

main().catch(console.error);



