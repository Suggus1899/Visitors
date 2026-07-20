import { createContext } from 'react';
import { AuthContextType } from '@logmaster/types';

export const AuthContext = createContext<AuthContextType | null>(null);
