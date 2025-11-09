
export interface Personality {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  voice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
}

export type GameState = 'idle' | 'generating' | 'speaking' | 'listening' | 'finished';

export interface Transcription {
  id: string;
  text: string;
  source: 'user' | 'model';
}

export interface GroundingSource {
    uri: string;
    title: string;
}
