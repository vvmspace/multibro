export interface Geolocation {
  country: string;
  city: string;
}

export interface ProxyEntry {
  proxy: string;
  protocol: string;
  ip: string;
  port: number;
  https: boolean;
  anonymity: string;
  score: number;
  geolocation?: Geolocation;
}

export interface Bro {
  id: number;
  country?: string;
  user_dir?: string;
  proxy?: ProxyEntry;
}

export interface Config {
  bros: Bro[];
  home_dir?: string;
  country?: string;
  protocol?: string;
}
