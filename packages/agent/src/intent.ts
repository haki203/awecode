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

export type IntentDeclaration =
  | { type: 'direct' }
  | { type: 'workflow'; name: string };

const WORKFLOW_RE = /start_workflow\(["']([\w-]+)["']\)/;

export function detectIntentFromText(content: string): IntentDeclaration {
  if (typeof content !== 'string') return { type: 'direct' };
  const match = content.match(WORKFLOW_RE);
  if (match && match[1]) {
    return { type: 'workflow', name: match[1] };
  }
  return { type: 'direct' };
}
