
import React from 'react';
import { Personality } from '../types';

interface PersonalitySelectorProps {
  personalities: Personality[];
  onSelect: (personality: Personality) => void;
}

const PersonalitySelector: React.FC<PersonalitySelectorProps> = ({ personalities, onSelect }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-2xl font-semibold mb-6 text-center">Choose Your Host's Personality</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {personalities.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="bg-gray-700 hover:bg-indigo-600 transition-all duration-300 rounded-lg p-5 text-left focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <h3 className="text-xl font-bold text-white">{p.name}</h3>
            <p className="text-gray-400 mt-1">{p.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PersonalitySelector;
