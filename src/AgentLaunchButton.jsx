import React, { useState } from 'react';
import { LoaderCircle, Play } from 'lucide-react';

export default function AgentLaunchButton({ client, disabled, busy, onLaunch }) {
  const [offeredChoices, setOfferedChoices] = useState(null);
  const choices = offeredChoices || client.launchChoices || [];
  if (choices.length > 1) return <select className="agent-launch-select" aria-label={'运行 ' + client.name} value="" disabled={disabled} onChange={event => {
    if (event.target.value) onLaunch(event.target.value);
  }}>
    <option value="" disabled>{busy ? '启动中…' : '运行'}</option>
    {choices.map(choice => <option key={choice.kind} value={choice.kind}>{choice.label}</option>)}
  </select>;
  return <button className="text-button agent-launch-button" aria-label={'运行 ' + client.name} disabled={disabled} onClick={async () => {
    const result = await onLaunch();
    if (result?.choices) setOfferedChoices(result.choices);
  }}>{busy ? <LoaderCircle size={12} className="spin" /> : <Play size={12} />}运行</button>;
}
