"use client";

import { useEffect, useState } from 'react';

interface AIResponseProps {
  message: string;
  duration?: number; // Duration in milliseconds before fading out
}

export default function AIResponse({ message, duration = 3000 }: AIResponseProps) {
  const [visible, setVisible] = useState(true);
  const [animationState, setAnimationState] = useState<'appearing' | 'visible' | 'disappearing'>('appearing');

  useEffect(() => {
    // Start with appearing animation
    setAnimationState('appearing');
    
    // After appearing animation, set to visible
    const visibleTimer = setTimeout(() => {
      setAnimationState('visible');
    }, 300);
    
    // Start disappearing after duration
    const disappearTimer = setTimeout(() => {
      setAnimationState('disappearing');
    }, duration);
    
    // Remove from DOM after disappearing animation completes
    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, duration + 300);
    
    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(disappearTimer);
      clearTimeout(removeTimer);
    };
  }, [duration]);
  
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-16 right-6 z-50 flex items-center justify-center pointer-events-none">
      <div
        className={`
          relative flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full shadow-lg
          transform transition-all duration-300
          ${animationState === 'appearing' ? 'scale-90 opacity-0' : ''}
          ${animationState === 'visible' ? 'scale-100 opacity-100' : ''}
          ${animationState === 'disappearing' ? 'scale-105 opacity-0' : ''}
        `}
      >
        {/* Star icon with rotation animation */}
        <div className="relative">
          <div className={`
            absolute inset-0 bg-white rounded-full 
            transform transition-all duration-500
            ${animationState === 'appearing' ? 'scale-0 opacity-0' : ''}
            ${animationState === 'visible' ? 'scale-100 opacity-20 animate-ping' : ''}
            ${animationState === 'disappearing' ? 'scale-150 opacity-0' : ''}
          `}></div>
          <svg 
            className={`w-5 h-5 text-white relative z-10 ${animationState === 'appearing' ? 'animate-spin-slow' : ''}`}
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
        
        {/* Message text */}
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}

// AIResponseManager - Singleton for showing AI responses
export class AIResponseManager {
  private static instance: AIResponseManager;
  private container: HTMLDivElement | null = null;
  
  private constructor() {
    // Private constructor to enforce singleton
    if (typeof window !== 'undefined') {
      this.createContainer();
    }
  }
  
  public static getInstance(): AIResponseManager {
    if (!AIResponseManager.instance) {
      AIResponseManager.instance = new AIResponseManager();
    }
    return AIResponseManager.instance;
  }
  
  private createContainer() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.id = 'ai-response-container';
    this.container.className = 'fixed bottom-0 right-0 z-50 flex flex-col items-end p-4 pointer-events-none';
    document.body.appendChild(this.container);
  }
  
  public showResponse(message: string): void {
    if (typeof window === 'undefined') return;
    if (!this.container) this.createContainer();
    
    // Create wrapper for this specific response
    const responseWrapper = document.createElement('div');
    responseWrapper.className = 'mb-2 transform transition-all duration-300';
    this.container?.appendChild(responseWrapper);
    
    // Use React to render our component
    const root = document.createElement('div');
    responseWrapper.appendChild(root);
    
    // Create a temporary component to render
    const TempComponent = () => {
      const [show, setShow] = useState(true);
      
      useEffect(() => {
        const timer = setTimeout(() => {
          setShow(false);
          // Remove from DOM after animation
          setTimeout(() => {
            if (responseWrapper.parentNode) {
              responseWrapper.parentNode.removeChild(responseWrapper);
            }
          }, 300);
        }, 3000);
        
        return () => clearTimeout(timer);
      }, []);
      
      if (!show) return null;
      
      return (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full shadow-lg animate-fade-in transform transition-all duration-300 scale-100 opacity-100">
          {/* Star icon with rotation and ping animation */}
          <div className="relative">
            <div className="absolute inset-0 bg-white rounded-full opacity-20 animate-ping"></div>
            <svg 
              className="w-5 h-5 text-white relative z-10 animate-spin-slow"
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          
          {/* Message text */}
          <span className="text-sm font-medium">{message}</span>
        </div>
      );
    };
    
    // Use React's createRoot API if available (React 18+)
    if (typeof window !== 'undefined') {
      // Use dynamic import instead of require
      import('react-dom/client').then((ReactDOM) => {
        const root = ReactDOM.createRoot(responseWrapper);
        root.render(<TempComponent />);
      });
    }
  }
}

// Helper function to show AI responses
export function showAIResponse(message: string): void {
  if (typeof window === 'undefined') return;
  
  // Use setTimeout to ensure this runs after the component is mounted
  setTimeout(() => {
    AIResponseManager.getInstance().showResponse(message);
  }, 0);
}
