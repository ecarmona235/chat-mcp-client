interface DynamicDiscoveryInterface {
  getAllTools(): Promise<any[]>;
  findToolsByCategory(category: string): Promise<any[]>;
  findToolsByCapability(capability: string): Promise<any[]>;
}

export default DynamicDiscoveryInterface;
