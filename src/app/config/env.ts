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
});

// Function to validate environment variables
const validateEnv = () => {
  try {
    logger.info("Validating environment variables");
    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
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
