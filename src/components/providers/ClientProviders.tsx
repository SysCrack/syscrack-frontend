"use client";

import React from "react";
import { AuthProvider } from "./AuthProvider";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Toaster } from "sonner";

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <AuthProvider>
                <QueryProvider>
                    <React.Fragment>
                        {children}
                        <Toaster
                            position="bottom-right"
                            richColors
                            closeButton
                            toastOptions={{
                                duration: 4000,
                            }}
                        />
                    </React.Fragment>
                </QueryProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
