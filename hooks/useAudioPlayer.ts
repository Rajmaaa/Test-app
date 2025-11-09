
import { useState, useRef, useCallback, useEffect } from 'react';
import { decode, decodeAudioData } from '../utils/audioUtils';

// Safari requires a user interaction to start AudioContext.
// This hook manages the creation and playback queue.
export const useAudioPlayer = (sampleRate: number = 24000) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const createAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
            audioContextRef.current = context;
        } catch (e) {
            console.error("AudioContext not supported", e);
        }
    }
    return audioContextRef.current;
  }, [sampleRate]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const playAudio = useCallback(async (base64Audio: string) => {
    const context = createAudioContext();
    if (!context) return;

    // Resume context if it's suspended (e.g., due to browser policy)
    if (context.state === 'suspended') {
      await context.resume();
    }
    
    setIsPlaying(true);
    const audioBytes = decode(base64Audio);
    const audioBuffer = await decodeAudioData(audioBytes, context, sampleRate, 1);
    
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const currentTime = context.currentTime;
    const startTime = Math.max(currentTime, nextStartTimeRef.current);
    
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;
    
    source.onended = () => {
        if(context.currentTime >= nextStartTimeRef.current - 0.1) {
            setIsPlaying(false);
        }
    };
  }, [sampleRate, createAudioContext]);

  return { playAudio, isPlaying, createAudioContext };
};
