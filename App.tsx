
import React, { useState } from 'react';
import { Personality } from './types';
import { PERSONALITIES } from './constants';
import PersonalitySelector from './components/PersonalitySelector';
import GameUI from './components/GameUI';

const App: React.FC = () => {
  const [selectedPersonality, setSelectedPersonality] = useState<Personality | null>(null);

  const handlePersonalitySelect = (personality: Personality) => {
    setSelectedPersonality(personality);
  };

  const handleReset = () => {
    setSelectedPersonality(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
            AI Trivia Host
          </h1>
          <p className="text-gray-400 mt-2">
            A voice-powered trivia game with a personality of your choice.
          </p>
        </header>

        <main className="bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 min-h-[60vh] flex flex-col">
          {!selectedPersonality ? (
            <PersonalitySelector personalities={PERSONALITIES} onSelect={handlePersonalitySelect} />
          ) : (
            <GameUI personality={selectedPersonality} onReset={handleReset} />
          )}
        </main>
        <footer className="text-center mt-8 text-gray-500 text-sm">
            <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
