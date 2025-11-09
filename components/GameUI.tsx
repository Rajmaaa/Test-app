import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Personality, GameState, Transcription, GroundingSource } from '../types';
import { generateTriviaQuestion, textToSpeech, connectToLiveConversation } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { LoadingSpinner } from './icons';
// FIX: The LiveSession type is not exported from the SDK.
import { LiveServerMessage, Blob as GenAiBlob } from '@google/genai';
import { encode } from '../utils/audioUtils';

interface GameUIProps {
  personality: Personality;
  onReset: () => void;
}

const GameUI: React.FC<GameUIProps> = ({ personality, onReset }) => {
    const [gameState, setGameState] = useState<GameState>('idle');
    const [currentQuestion, setCurrentQuestion] = useState<{ question: string; answer: string } | null>(null);
    const [transcripts, setTranscripts] = useState<Transcription[]>([]);
    const [sources, setSources] = useState<GroundingSource[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [score, setScore] = useState(0);

    const { playAudio, isPlaying } = useAudioPlayer();
    // FIX: Using Promise<any> because LiveSession type is not exported.
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    const handleNewQuestion = useCallback(async () => {
        setGameState('generating');
        setError(null);
        setTranscripts([]);
        setCurrentQuestion(null);
        setSources([]);

        try {
            const { question, answer, sources } = await generateTriviaQuestion(personality.systemPrompt);
            setCurrentQuestion({ question, answer });
            setSources(sources);
            
            setGameState('speaking');
            const audio = await textToSpeech(`Here is your question: ${question}`, personality.voice);
            if (audio) {
                await playAudio(audio);
            }
            setGameState('listening');
        } catch (err) {
            setError('Failed to generate a question. Please try again.');
            setGameState('idle');
        }
    }, [personality, playAudio]);
    
    useEffect(() => {
        if(gameState === 'listening' && currentQuestion) {
            startLiveSession();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, currentQuestion]);

    const stopLiveSession = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }
        if (microphoneStreamRef.current) {
            microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            microphoneStreamRef.current = null;
        }
        if (audioProcessorRef.current) {
            audioProcessorRef.current.disconnect();
            audioProcessorRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
             audioContextRef.current.close();
             audioContextRef.current = null;
        }
    },[]);

    const startLiveSession = useCallback(async () => {
        if (!currentQuestion) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            microphoneStreamRef.current = stream;
            
            const systemInstruction = `${personality.systemPrompt} The user is answering the question: "${currentQuestion.question}". The correct answer is "${currentQuestion.answer}". Determine if the user is correct, tell them, update their score, and then say "Ready for the next one?".`;
            
            const onMessage = (message: LiveServerMessage) => {
                if (message.serverContent?.inputTranscription) {
                    currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                }
                if (message.serverContent?.outputTranscription) {
                    currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                }
                if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                    playAudio(message.serverContent.modelTurn.parts[0].inlineData.data);
                }
                if (message.serverContent?.turnComplete) {
                    if (currentInputTranscriptionRef.current) {
                        setTranscripts(prev => [...prev, { id: Date.now().toString() + 'user', text: currentInputTranscriptionRef.current, source: 'user' }]);
                    }
                    if (currentOutputTranscriptionRef.current) {
                        setTranscripts(prev => [...prev, { id: Date.now().toString() + 'model', text: currentOutputTranscriptionRef.current, source: 'model' }]);
                        if(currentOutputTranscriptionRef.current.toLowerCase().includes('correct')) {
                            setScore(s => s + 1);
                        }
                    }
                    currentInputTranscriptionRef.current = '';
                    currentOutputTranscriptionRef.current = '';
                    setGameState('finished');
                    stopLiveSession();
                }
            };
            
            // FIX: Moved audio processing logic into the onopen callback, as per SDK guidelines.
            const onOpen = () => {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                audioContextRef.current = context;
                const source = context.createMediaStreamSource(stream);
                const scriptProcessor = context.createScriptProcessor(4096, 1, 1);
                audioProcessorRef.current = scriptProcessor;

                scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                    const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                    const l = inputData.length;
                    const int16 = new Int16Array(l);
                    for (let i = 0; i < l; i++) {
                      int16[i] = inputData[i] * 32768;
                    }
                    
                    const base64 = encode(new Uint8Array(int16.buffer));

                    const pcmBlob: GenAiBlob = {
                        data: base64,
                        mimeType: 'audio/pcm;rate=16000',
                    };
                    if(sessionPromiseRef.current) {
                        sessionPromiseRef.current.then((session) => {
                          session.sendRealtimeInput({ media: pcmBlob });
                        });
                    }
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(context.destination);
            };

            sessionPromiseRef.current = connectToLiveConversation({
                systemInstruction,
                callbacks: {
                    onopen: onOpen,
                    onmessage: onMessage,
                    onerror: (e) => {
                        console.error("Live session error:", e);
                        setError("A connection error occurred.");
                        setGameState('idle');
                        stopLiveSession();
                    },
                     onclose: () => {
                        stopLiveSession();
                    }
                }
            });

        } catch (err) {
            setError("Could not access microphone. Please enable microphone permissions.");
            setGameState('idle');
        }
    }, [currentQuestion, personality.systemPrompt, playAudio, stopLiveSession]);

    useEffect(() => {
        return () => {
            stopLiveSession();
        };
    }, [stopLiveSession]);

    const getStatusMessage = () => {
        switch (gameState) {
            case 'idle': return 'Click "Start Game" to begin.';
            case 'generating': return 'Your host is thinking of a question...';
            case 'speaking': return 'Listen to the question...';
            case 'listening': return 'Listening for your answer...';
            case 'finished': return 'Round finished. Ready for the next one?';
            default: return '';
        }
    };
    
    return (
        <div className="flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-xl font-bold">{personality.name}</h2>
                    <p className="text-gray-400">Score: {score}</p>
                </div>
                <button onClick={onReset} className="text-sm bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-md transition-colors">Change Host</button>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4 flex-grow overflow-y-auto mb-4 min-h-[200px]">
                <p className="text-lg text-gray-300 mb-4">{currentQuestion?.question || 'Waiting for question...'}</p>
                <div className="space-y-3">
                    {transcripts.map(t => (
                        <div key={t.id} className={`flex ${t.source === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <p className={`max-w-[80%] p-3 rounded-lg ${t.source === 'user' ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                                {t.text}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {sources.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-sm text-gray-400 mb-1">Sources:</h4>
                    <div className="flex flex-wrap gap-2">
                        {sources.map((source, i) => (
                           <a href={source.uri} key={i} target="_blank" rel="noopener noreferrer" className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-full truncate">{source.title || new URL(source.uri).hostname}</a>
                        ))}
                    </div>
                </div>
            )}
            
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
            
            <div className="text-center mt-auto">
                <div className="flex items-center justify-center space-x-4 mb-2">
                    {(gameState === 'listening' || isPlaying) && <div className="w-16 h-16 bg-purple-500 rounded-full animate-pulse"></div>}
                    {gameState === 'generating' && <LoadingSpinner className="w-16 h-16 text-indigo-400" />}
                </div>
                <p className="text-gray-400 h-6">{getStatusMessage()}</p>
                
                {gameState === 'idle' && <button onClick={handleNewQuestion} className="mt-4 bg-indigo-600 hover:bg-indigo-500 px-8 py-3 rounded-full font-bold text-lg transition-transform hover:scale-105">Start Game</button>}
                {gameState === 'finished' && <button onClick={handleNewQuestion} className="mt-4 bg-green-600 hover:bg-green-500 px-8 py-3 rounded-full font-bold text-lg transition-transform hover:scale-105">Next Question</button>}
            </div>
        </div>
    );
};

export default GameUI;