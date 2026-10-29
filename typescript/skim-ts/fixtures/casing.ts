export type Config = {
  host: string;
  port: number;
};

export const config: Config = {
  host: "localhost",
  port: 3000,
};

export function setupServer(cfg: Config): void {
  console.log(`Server at ${cfg.host}:${cfg.port}`);
}
