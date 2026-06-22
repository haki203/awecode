// Copyright 2026 Awecode Contributors. Apache-2.0.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerSW } from './sw/register.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
registerSW();
