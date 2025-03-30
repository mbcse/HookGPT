# HookGPT - Uniswap Hook Conversational Agent

HookGPT is a production-ready AI-powered conversational AI agent and generator for Uniswap v4 hooks that transforms natural language prompts into optimized smart contract code. It leverages large language models with specialized knowledge of Uniswap protocols to help developers create custom hooks without needing deep expertise in DeFi programming.

## 🚀 Overview

Uniswap v4's introduction of hooks created a powerful new paradigm for DeFi customization, but simultaneously raised a significant barrier to entry for developers. The idea for HookGPT was inspired by witnessing talented developers struggle with the complexity of implementing custom hooks, despite having innovative ideas for DeFi mechanisms.
Many developers had creative concepts for liquidity management, fee structures, or trading strategies, but lacked the specialized knowledge of Solidity optimization, Uniswap v4's internal architecture, and hook development patterns. This created a bottleneck where innovative ideas couldn't be implemented due to technical complexity.
HookGPT solves these problems by democratizing access to hook development through natural language interaction. By training our AI on a comprehensive dataset from Hook Rank's production-grade implementations across multiple chains, we created a system that can:

- Translate conceptual ideas into functional hook code
- Apply common patterns and optimizations automatically
- Handle cross-chain compatibility considerations
- Generate appropriate testing frameworks alongside implementation
- Provide explanations of the generated code for educational purposes
This bridges the gap between DeFi innovators and implementation, accelerating the ecosystem's growth. The project addresses the fundamental bottleneck in Uniswap v4's expanding ecosystem: the shortage of specialized developers who can implement custom hooks for the growing number of use cases.
HookGPT serves primarily as a productivity tool and educational resource that helps developers bootstrap their hook development process, while leaving final verification and security considerations to human experts.

## 📋 Features

- AI-powered Uniswap v4 hook code generation
- Contextual conversation with specialized hook knowledge
- Vector database storage for persistent memory and hook examples
- Streaming responses for real-time generation
- Session management for multi-turn conversations
- OpenAPI documentation
- Docker support for easy deployment
- Rate limiting and security middleware

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **AI/ML**: LangChain, OpenAI, Anthropic Claude
- **Database**: PostgreSQL with pgvector extension
- **Documentation**: OpenAPI/Swagger
- **DevOps**: Docker, Docker Compose
- **Testing**: Vitest, Supertest
- **Code Quality**: Biome (linting/formatting), Husky (git hooks)

## 🏗️ Architecture

The project follows a clean architecture pattern with the following structure:

- **API Layer**: Express routes and controllers
- **Service Layer**: Business logic and AI agent integration
- **Repository Layer**: Data access and persistence
- **Common**: Shared utilities, middleware, and configurations

### Key Components

- **Hooks API**: Main endpoints for hook generation and conversation
- **Uniswap Hook Generator Agent**: Core implementation of the hook generation and response logic
- **Vector Store**: Persistent storage for embeddings and Uniswap documentation
- **LLM Manager**: Abstraction for different LLM providers
- **Session Management**: Persistent storage of conversation history

## 🔧 Setup & Installation

### Prerequisites

- Node.js (version specified in `.nvmrc`)
- Docker and Docker Compose (for running PostgreSQL with pgvector)
- API keys for LLM providers (OpenAI, Anthropic)

### Environment Setup

1. Clone the repository
2. Copy `.env.template` to `.env` and fill in the required values:

```
# Environment Configuration
NODE_ENV="development" # Options: 'development', 'production'
PORT="8080"            # The port your server will listen on
HOST="localhost"       # Hostname for the server

# CORS Settings
CORS_ORIGIN="http://localhost:*" # Allowed CORS origin, adjust as necessary

# Rate Limiting
COMMON_RATE_LIMIT_WINDOW_MS="1000" # Window size for rate limiting (ms)
COMMON_RATE_LIMIT_MAX_REQUESTS="20" # Max number of requests per window per IP

# API Keys
ANTHROPIC_API_KEY="your_anthropic_api_key"
OPENAI_API_KEY="your_openai_api_key"
```

### Database Setup

Start the PostgreSQL database with pgvector extension:

```bash
docker compose up -d
```

### Installation

Install dependencies:

```bash
npm ci
```

### Development

Run the development server:

```bash
npm run dev
```

### Production Build

Build the project:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## 📝 API Documentation

Once the server is running, you can access the OpenAPI documentation at:

```
http://localhost:8080/api-docs
```

### Main Endpoints

- `POST /hooks/init-session`: Initialize a new session for hook generation
- `POST /hooks/chat`: Send a message to the AI agent and receive a streaming response
- `POST /hooks/generate-reply`: Generate a detailed response without streaming
- `POST /hooks/generate-hook-code`: Generate Uniswap hook code based on session context

## 🧪 Testing

Run tests:

```bash
npm test
```

## 🐳 Docker Deployment

Build and run the Docker container:

```bash
docker build -t uniswap-hook-generator-api .
docker run -p 8080:8080 --env-file .env uniswap-hook-generator-api
```

Or use Docker Compose for a complete setup with the database:

```bash
docker compose up
```

## 🧩 Project Structure

```
hook-generator-api/
├── src/                      # Source code
│   ├── api/                  # API routes and controllers
│   │   ├── hooks/            # Hooks API endpoints
│   │   └── healthCheck/      # Health check endpoint
│   ├── api-docs/             # OpenAPI documentation
│   ├── common/               # Shared utilities
│   │   ├── ai/               # AI-related implementations
│   │   │   ├── uniswapHookAgent/ # Hook agent implementation
│   │   │   ├── LLMModelManager.ts # LLM provider abstraction
│   │   │   ├── EmbeddingManager.ts # Embedding provider abstraction
│   │   │   └── VectorStoreManager.ts # Vector store abstraction
│   │   ├── contextFetchers/  # Context fetching utilities
│   │   ├── middleware/       # Express middleware
│   │   └── utils/            # Utility functions
│   ├── database/             # Database access and schemas
│   ├── server.ts             # Express server setup
│   └── index.ts              # Application entry point
├── dist/                     # Compiled JavaScript
├── node_modules/             # Dependencies
├── prisma/                   # Prisma schema and migrations
├── .husky/                   # Git hooks
├── Dockerfile                # Docker configuration
├── docker-compose.yml        # Docker Compose configuration
├── package.json              # Project metadata and scripts
├── tsconfig.json             # TypeScript configuration
└── .env                      # Environment variables
```

## 🔒 Security

The API includes several security features:

- Helmet for HTTP security headers
- Rate limiting to prevent abuse
- CORS configuration
- Environment variable validation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request