interface DynamicSchemaInterface {
  getToolSchema(toolName: string): Promise<any>;
  validateSchema(schema: any): boolean;
  updateSchema(toolName: string, schema: any): Promise<void>;
}

export default DynamicSchemaInterface;
