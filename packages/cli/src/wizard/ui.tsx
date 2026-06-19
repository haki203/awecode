// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState } from 'react';
import { Box, Text, render as inkRender, useInput, type Instance } from 'ink';
import SelectInput from 'ink-select-input';
import { TextInput } from '@inkjs/ui';
import { PROVIDER_CHOICES, DEFAULT_MODELS } from './prompts.js';
import type { AwecodeConfig, ProviderConfig, ProviderType } from '@awecode/llm';

interface WizardAppProps {
  onComplete: (config: AwecodeConfig | null) => void;
}

type WizardStep =
  | 'select-provider'
  | 'enter-api-key'
  | 'enter-base-url'
  | 'enter-model'
  | 'confirm';

// Discriminated by the ProviderType union so the switch is exhaustive.
function buildProviderConfig(
  providerType: ProviderType,
  apiKey: string,
  baseURL: string,
  model: string,
): ProviderConfig {
  switch (providerType) {
    case 'anthropic':
      return { type: 'anthropic', apiKey, defaultModel: model };
    case 'openai':
      return { type: 'openai', apiKey, defaultModel: model };
    case 'google':
      return { type: 'google', apiKey, defaultModel: model };
    case 'ollama':
      return { type: 'ollama', baseURL, defaultModel: model };
    case 'openai-compatible':
      return { type: 'openai-compatible', baseURL, apiKey, defaultModel: model };
  }
}

export function WizardApp({ onComplete }: WizardAppProps) {
  const [step, setStep] = useState<WizardStep>('select-provider');
  const [providerType, setProviderType] = useState<ProviderType | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');

  const handleSelectProvider = (item: { value: string }) => {
    if (item.value === 'skip') {
      onComplete(null);
      return;
    }
    // item.value is one of the ProviderType values (excluding 'skip').
    const picked = item.value as ProviderType;
    setProviderType(picked);
    const defaultModel = DEFAULT_MODELS[item.value];
    if (defaultModel) {
      setModel(defaultModel);
    }

    if (item.value === 'ollama') {
      setBaseURL('http://localhost:11434');
      setStep('enter-base-url');
    } else if (item.value === 'openai-compatible') {
      setStep('enter-base-url');
    } else {
      setStep('enter-api-key');
    }
  };

  if (step === 'select-provider') {
    return (
      <Box flexDirection="column">
        <Text bold>Welcome to awecode! Let&apos;s set up your LLM provider.</Text>
        <Text> </Text>
        <Text>? Choose provider:</Text>
        <SelectInput
          items={PROVIDER_CHOICES.map((c) => ({ label: c.label, value: c.value }))}
          onSelect={handleSelectProvider}
        />
      </Box>
    );
  }

  if (step === 'enter-api-key') {
    return (
      <Box flexDirection="column">
        <Text>? API key:</Text>
        {/* @inkjs/ui TextInput is uncontrolled in v2; onChange mirrors state for buildConfig(). */}
        <TextInput
          placeholder="paste your API key"
          onChange={setApiKey}
          onSubmit={() => setStep('enter-model')}
        />
      </Box>
    );
  }

  if (step === 'enter-base-url') {
    const placeholder =
      providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1';
    const next: WizardStep = providerType === 'ollama' ? 'enter-model' : 'enter-api-key';
    return (
      <Box flexDirection="column">
        <Text>? Base URL [{placeholder}]:</Text>
        <TextInput
          placeholder={placeholder}
          defaultValue={providerType === 'ollama' ? 'http://localhost:11434' : ''}
          onChange={setBaseURL}
          onSubmit={() => setStep(next)}
        />
      </Box>
    );
  }

  if (step === 'enter-model') {
    const defaultModel = providerType === '' ? '' : (DEFAULT_MODELS[providerType] ?? '');
    return (
      <Box flexDirection="column">
        <Text>? Default model [{defaultModel}]:</Text>
        <TextInput
          defaultValue={defaultModel}
          onChange={setModel}
          onSubmit={() => setStep('confirm')}
        />
      </Box>
    );
  }

  // step === 'confirm'
  // Use useInput at the top level of the confirm render via a dedicated component,
  // because hooks cannot be called conditionally.
  return (
    <ConfirmScreen
      providerType={providerType}
      model={model}
      baseURL={baseURL}
      apiKey={apiKey}
      onComplete={onComplete}
    />
  );
}

interface ConfirmScreenProps {
  providerType: ProviderType | '';
  model: string;
  baseURL: string;
  apiKey: string;
  onComplete: (config: AwecodeConfig | null) => void;
}

function ConfirmScreen({
  providerType,
  model,
  baseURL,
  apiKey,
  onComplete,
}: ConfirmScreenProps) {
  useInput((input, key) => {
    if (key.return) {
      if (providerType === '') {
        // Defensive — should be unreachable.
        onComplete(null);
        return;
      }
      const cfg = buildProviderConfig(providerType, apiKey, baseURL, model);
      onComplete({
        activeProvider: providerType,
        providers: { [providerType]: cfg },
      });
    }
    if (key.escape) {
      onComplete(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>{'\u2713'} Configuration ready:</Text>
      <Text>  Provider: {providerType}</Text>
      <Text>  Model: {model}</Text>
      {baseURL !== '' && <Text>  Base URL: {baseURL}</Text>}
      <Text> </Text>
      <Text>Press Enter to save, Esc to cancel.</Text>
    </Box>
  );
}

export async function runWizard(): Promise<AwecodeConfig | null> {
  return new Promise<AwecodeConfig | null>((resolve) => {
    let instance: Instance | null = null;
    instance = inkRender(
      <WizardApp
        onComplete={(cfg) => {
          instance?.unmount();
          resolve(cfg);
        }}
      />,
    );
  });
}
