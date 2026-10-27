"use client";

import { createContext, useContext } from "react";

/**
 * Lets a page open another tab, optionally with that tab's own address
 * settings (e.g. the Consulates page's `scope=country`). Provided by the shell.
 */
export type OpenTab = (tab: string, params?: Record<string, string>) => void;

export const TabNavigationContext = createContext<OpenTab>(() => {});

export const useOpenTab = (): OpenTab => useContext(TabNavigationContext);
