"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import type { User, Session, Subscription } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isPremium: boolean;
  subscription: Subscription | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<() => void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isPremium: false,
  subscription: null,

  setUser: (user) => {
    // Check if user is premium from metadata
    const isPremium = user?.user_metadata?.is_premium ?? false;
    set({ user, isPremium });
  },

  setSession: (session) => {
    set({ session });
    if (session?.user) {
      get().setUser(session.user);
    } else {
      set({ user: null, isPremium: false });
    }
  },

  setIsLoading: (isLoading) => set({ isLoading }),

  signOut: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, session: null, isPremium: false });
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession();
      get().setSession(session);

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          get().setSession(session);
        }
      );

      set({ subscription });

      // Return cleanup function
      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("Error initializing auth:", error);
      return () => {}; // Return empty cleanup on error
    } finally {
      set({ isLoading: false });
    }
  },
}));
