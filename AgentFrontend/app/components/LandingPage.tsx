"use client";

import React, { useState } from 'react';
import { ArrowRight, Sparkles, Code, ShieldCheck, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from '../context/SessionContext';

const LandingPage = () => {
  const router = useRouter();
  const { initializeSession, addUserMessage } = useSession();
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      // Initialize session with the prompt
      await initializeSession(prompt);
      
      // Store the user's prompt to display in the creation page
      addUserMessage(prompt);
      
      // Navigate to hook creation page
      router.push('/create');
    } catch (error) {
      console.error('Error starting session:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="py-6 px-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-600 rounded-full">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold">HookGPT</span>
        </div>
        <nav>
          <ul className="flex gap-8">
            <li><a href="#" className="hover:text-green-400 transition-colors">Home</a></li>
            <li><a href="#" className="hover:text-green-400 transition-colors">Examples</a></li>
            <li><a href="#" className="hover:text-green-400 transition-colors">Documentation</a></li>
            <li><a href="https://github.com/Uniswap/v4-core" target="_blank" rel="noreferrer" className="hover:text-green-400 transition-colors">Uniswap V4</a></li>
          </ul>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-6xl font-bold mb-6 leading-tight max-w-4xl">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
            Uniswap V4 Hooks
          </span>
          <br />
          in Seconds
        </h1>
        
        <p className="text-gray-400 text-xl mb-12 max-w-2xl">
          Describe the Uniswap V4 hook you want to create and instantly transform your idea into working Solidity code.
        </p>
        
        <form onSubmit={handleSubmit} className="w-full max-w-5xl">
          <div className="relative">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your hook... (e.g., 'A hook that adds a 0.5% fee to all swaps and sends it to a treasury')"
              className="w-full py-4 px-6 rounded-lg bg-gray-900 border border-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isSubmitting}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:text-gray-400 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <span>Create Hook</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Features section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Why Use HookGPT?</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gray-900 p-6 rounded-xl">
              <div className="bg-green-600 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <Code className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Quick Prototyping</h3>
              <p className="text-gray-400">Rapidly prototype custom Uniswap V4 hooks without writing code from scratch.</p>
            </div>
            
            <div className="bg-gray-900 p-6 rounded-xl">
              <div className="bg-blue-600 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Gas Optimized</h3>
              <p className="text-gray-400">Get efficient, gas-optimized Solidity code that follows best practices.</p>
            </div>
            
            <div className="bg-gray-900 p-6 rounded-xl">
              <div className="bg-teal-600 w-12 h-12 flex items-center justify-center rounded-full mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Security Focused</h3>
              <p className="text-gray-400">Hook code follows security best practices to help prevent common vulnerabilities.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Sparkles className="w-5 h-5 text-green-500" />
            <span className="font-semibold">HookGPT</span> &copy; {new Date().getFullYear()}
          </div>
          
          <div className="text-gray-500 text-sm">
            Creating Uniswap V4 hooks with ease
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage; 