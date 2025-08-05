import dotenv from "dotenv";
import { z } from "zod";
import { Logger } from "@/app/utils/logger";

const logger = new Logger("Config:Env");
dotenv.config();
// Schema for environment variables
const envSchema = z.object({
  OPENAI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  GOOGLE_API_KEY: z.string(),
  MCP_SERVERS: z.array(z.string()).optional().default(["http://localhost:3001/mcp"]),
  // Cache service configuration
  REDIS_URL: z.string().optional().default("redis://localhost:6379"),
  CHROMA_URL: z.string().optional().default("http://localhost:8000"),
  CHROMA_PERSIST_DIR: z.string().optional().default("./chroma_db"),
});

// Function to validate environment variables
const validateEnv = () => {
  try {
    logger.info("Validating environment variables");
    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      MCP_SERVERS: process.env.MCP_SERVERS?.split(",") || ["http://localhost:3001/mcp"],
      // Cache service configuration
      REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
      CHROMA_URL: process.env.CHROMA_URL || "http://localhost:8000",
      CHROMA_PERSIST_DIR: process.env.CHROMA_PERSIST_DIR || "./chroma_db",
    };
    logger.info("Environment variables");
    const parsed = envSchema.parse(env);
    logger.info("Environment variables validated successfully");

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => err.path.join("."));
      logger.error("Invalid environment variables", { error: { missingVars } });
      throw new Error(
        `❌ Invalid environment variables: ${missingVars.join(
          ", "
        )}. Please check your .env file`
      );
    }
    throw error;
  }
};

export const env = validateEnv();
