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
import { PROVIDER_CHOICES, DEFAULT_MODELS, KEY_SOURCE_CHOICES } from './prompts.js';
import { DEFAULT_ENV_KEYS } from '@awecode/llm';
import type { AwecodeConfig, ProviderConfig, ProviderType } from '@awecode/llm';

interface WizardAppProps {
  onComplete: (config: AwecodeConfig | null) => void;
}

type WizardStep =
  | 'select-provider'
  | 'choose-key-source'
  | 'enter-api-key'
  | 'enter-env-key'
  | 'enter-base-url'
  | 'enter-model'
  | 'confirm';

// Discriminated by the ProviderType union so the switch is exhaustive.
// If `envKey` is set, the value is read from `process.env[envKey]` at
// load time; `apiKey` stays inline only when the user typed a literal
// value in the wizard.
function buildProviderConfig(
  providerType: ProviderType,
  apiKey: string,
  envKey: string,
  baseURL: string,
  model: string,
): ProviderConfig {
  switch (providerType) {
    case 'anthropic':
      return {
        type: 'anthropic',
        apiKey: apiKey || undefined,
        envKey: envKey || undefined,
        defaultModel: model,
      };
    case 'openai':
      return {
        type: 'openai',
        apiKey: apiKey || undefined,
        envKey: envKey || undefined,
        defaultModel: model,
      };
    case 'google':
      return {
        type: 'google',
        apiKey: apiKey || undefined,
        envKey: envKey || undefined,
        defaultModel: model,
      };
    case 'ollama':
      return { type: 'ollama', baseURL, defaultModel: model };
    case 'openai-compatible':
      return {
        type: 'openai-compatible',
        baseURL,
        apiKey: apiKey || undefined,
        envKey: envKey || undefined,
        defaultModel: model,
      };
  }
}

export function WizardApp({ onComplete }: WizardAppProps) {
  const [step, setStep] = useState<WizardStep>('select-provider');
  const [providerType, setProviderType] = useState<ProviderType | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [envKey, setEnvKey] = useState('');
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
      // Cloud providers (anthropic/openai/google) â€” route through the
      // key-source picker so users can choose env var vs inline.
      setStep('choose-key-source');
    }
  };

  const handleChooseKeySource = (item: { value: string }) => {
    if (item.value === 'inline') {
      setStep('enter-api-key');
    } else {
      // Pre-fill with the provider's conventional env var name so users
      // who already export OPENAI_API_KEY / ANTHROPIC_API_KEY / etc. can
      // just press Enter.
      const defaultEnv = providerType === '' ? '' : (DEFAULT_ENV_KEYS[providerType] ?? '');
      if (defaultEnv) setEnvKey(defaultEnv);
      setStep('enter-env-key');
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

  if (step === 'choose-key-source') {
    return (
      <Box flexDirection="column">
        <Text>? How do you want to provide your API key?</Text>
        <SelectInput
          items={KEY_SOURCE_CHOICES.map((c) => ({ label: c.label, value: c.value }))}
          onSelect={handleChooseKeySource}
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

  if (step === 'enter-env-key') {
    const defaultEnv = providerType === '' ? '' : (DEFAULT_ENV_KEYS[providerType] ?? '');
    return (
      <Box flexDirection="column">
        <Text>? Environment variable name [{defaultEnv}]:</Text>
        <TextInput
          defaultValue={defaultEnv}
          placeholder={defaultEnv}
          onChange={setEnvKey}
          onSubmit={() => setStep('enter-model')}
        />
      </Box>
    );
  }

  if (step === 'enter-base-url') {
    const placeholder =
      providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1';
    // For openai-compatible providers, after baseURL we still need to pick
    // an API key source (some compat servers don't need a key at all, which
    // is why we route through choose-key-source rather than enter-api-key).
    const next: WizardStep =
      providerType === 'ollama' ? 'enter-model' : 'choose-key-source';
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
      envKey={envKey}
      onComplete={onComplete}
    />
  );
}

interface ConfirmScreenProps {
  providerType: ProviderType | '';
  model: string;
  baseURL: string;
  apiKey: string;
  envKey: string;
  onComplete: (config: AwecodeConfig | null) => void;
}

function ConfirmScreen({
  providerType,
  model,
  baseURL,
  apiKey,
  envKey,
  onComplete,
}: ConfirmScreenProps) {
  useInput((input, key) => {
    if (key.return) {
      if (providerType === '') {
        // Defensive â€” should be unreachable.
        onComplete(null);
        return;
      }
      const cfg = buildProviderConfig(providerType, apiKey, envKey, baseURL, model);
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
      {envKey !== '' && <Text>  API key: from env ${envKey}</Text>}
      {envKey === '' && apiKey !== '' && <Text>  API key: (stored inline)</Text>}
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
