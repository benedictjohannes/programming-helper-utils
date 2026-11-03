export class UserService {
  private db: string;
  static instanceCount = 0;

  constructor(db: string) {
    this.db = db;
    UserService.instanceCount++;
  }

  static getCount(): number {
    return UserService.instanceCount;
  }

  public async getUser(id: string): Promise<{ id: string; name: string }> {
    return { id, name: "Alice" };
  }

  public get database(): string {
    return this.db;
  }

  public set database(val: string) {
    this.db = val;
  }

  public boundAction = (action: string): void => {
    console.log("Action:", action);
  };
}
