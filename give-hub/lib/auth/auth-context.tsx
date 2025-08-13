'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, Creator } from '@/_dev/mock-db/database';

// Define the shape of the authentication context
interface AuthContextType {
  user: User | Creator | null;
  signin: (emailOrUsername: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (username: string, email: string, password: string, role: 'user' | 'creator') => Promise<{ success: boolean; error?: string }>;
  signout: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  user: null,
  signin: async () => ({ success: false }),
  signup: async () => ({ success: false }),
  signout: async () => {},
  isLoading: true,
  error: null,
});

// Create a provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | Creator | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for an existing session on component mount
  useEffect(() => {
    const checkUserSession = async () => {
      setIsLoading(true);
      try {
        // This endpoint should verify the token and return the user
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch user session');
      } finally {
        setIsLoading(false);
      }
    };
    checkUserSession();
  }, []);

  const signup = async (username: string, email: string, password: string, role: 'user' | 'creator') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, role }),
      });
      const result = await res.json();
      if (res.ok) {
        setUser(result.user);
        return { success: true };
      } else {
        const details = result?.details ? Object.values(result.details).join('\n') : '';
        const message = details ? `${result.error || 'Signup failed'}\n${details}` : (result.error || 'Signup failed');
        setError(message);
        return { success: false, error: message };
      }
    } catch (err) {
        console.error(err);
      setError('An unexpected error occurred during signup');
      return { success: false, error: 'An unexpected error occurred during signup' };
    } finally {
      setIsLoading(false);
    }
  };

  const signin = async (emailOrUsername: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername, password }),
      });
      const result = await res.json();
      if (res.ok) {
        setUser(result.user);
        return { success: true };
      } else {
        const details = result?.details ? Object.values(result.details).join('\n') : '';
        const message = details ? `${result.error || 'Signin failed'}\n${details}` : (result.error || 'Signin failed');
        setError(message);
        return { success: false, error: message };
      }
    } catch (err) {
        console.error(err);
      setError('An unexpected error occurred during signin');
      return { success: false, error: 'An unexpected error occurred during signin' };
    } finally {
      setIsLoading(false);
    }
  };

  const signout = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser(null);
    } catch (err) {
        console.error(err);
      setError('Signout failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, signin, signup, signout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

// Create a custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);
