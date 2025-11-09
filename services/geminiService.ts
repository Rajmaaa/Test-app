// FIX: The LiveSession type is not exported from the SDK.
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateTriviaQuestion = async (personalityPrompt: string) => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are a trivia host with the following personality: "${personalityPrompt}". Generate one interesting and challenging trivia question and its answer. Respond with ONLY a valid JSON object containing a "question" and "answer" key.`,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });

        let jsonText = response.text.trim();
        // The model may wrap the JSON in markdown, so we need to clean it.
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7, jsonText.length - 3).trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.substring(3, jsonText.length - 3).trim();
        }

        const data = JSON.parse(jsonText);
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        return {
            question: data.question,
            answer: data.answer,
            sources: groundingChunks
                .map((chunk: any) => chunk.web)
                .filter(Boolean)
                .map((web: any) => ({ uri: web.uri, title: web.title }))
        };

    } catch (error) {
        console.error("Error generating trivia question:", error);
        throw error;
    }
};

export const textToSpeech = async (text: string, voice: string) => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice },
                    },
                },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (error) {
        console.error("Error with text-to-speech:", error);
        throw error;
    }
};

interface ConnectLiveConfig {
    systemInstruction: string;
    // FIX: All callbacks are required by the Gemini API.
    callbacks: {
        onopen: () => void;
        onmessage: (message: LiveServerMessage) => void;
        onerror: (e: ErrorEvent) => void;
        onclose: (e: CloseEvent) => void;
    };
}

// FIX: Removed async and incorrect return type. This function returns the promise from ai.live.connect directly.
// The LiveSession type is not exported from the SDK, so we rely on type inference.
export const connectToLiveConversation = ({ systemInstruction, callbacks }: ConnectLiveConfig) => {
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction
        }
    });
};