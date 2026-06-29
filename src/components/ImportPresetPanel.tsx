import React, { useEffect, useMemo, useState } from 'react';
import {
  createPreset,
  getPreset,
  getProject,
  listPresets,
  updatePreset,
  type PresetMeta,
  type ProjectMeta,
} from '../lib/projectApi';
import { extractPresetSettings, getPresetIdFromData } from '../lib/presetSettings';
import { Section } from './Controls';

export interface ImportPresetProps {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  currentPresetId: string | null;
  onPresetIdChange: (presetId: string | null) => void;
  currentSettings: Record<string, any>;
  onApplySettings: (data: Record<string, any>) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => number;
}

export const ImportPresetPanel: React.FC<ImportPresetProps> = ({
  projects,
  activeProjectId,
  currentPresetId,
  onPresetIdChange,
  currentSettings,
  onApplySettings,
  addToast,
}) => {
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [importingProject, setImportingProject] = useState(false);
  const [importingPreset, setImportingPreset] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [updatingPreset, setUpdatingPreset] = useState(false);
  const [presets, setPresets] = useState<PresetMeta[]>([]);

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId],
  );
  const currentPresetMeta = useMemo(
    () => presets.find((preset) => preset.id === currentPresetId) ?? null,
    [presets, currentPresetId],
  );

  useEffect(() => {
    listPresets().then(setPresets).catch(() => {});
  }, []);

  useEffect(() => {
    setPresetId(currentPresetId ?? '');
  }, [currentPresetId]);
  const handleImportProject = async () => {
    if (!sourceProjectId) return;
    setImportingProject(true);
    try {
      const proj = await getProject(sourceProjectId);
      onApplySettings(extractPresetSettings(proj));
      onPresetIdChange(getPresetIdFromData(proj));
      const sourceName = otherProjects.find((p) => p.id === sourceProjectId)?.name ?? sourceProjectId;
      addToast(`Imported settings from "${sourceName}"`, 'success');
    } catch {
      addToast('Failed to import project settings', 'error');
    } finally {
      setImportingProject(false);
    }
  };

  const handleImportPreset = async () => {
    if (!presetId) return;
    setImportingPreset(true);
    try {
      const preset = await getPreset(presetId);
      onApplySettings(extractPresetSettings(preset));
      onPresetIdChange(presetId);
      const sourceName = presets.find((p) => p.id === presetId)?.name ?? presetId;
      addToast(`Applied preset "${sourceName}"`, 'success');
    } catch {
      addToast('Failed to apply preset', 'error');
    } finally {
      setImportingPreset(false);
    }
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    setSavingPreset(true);
    try {
      const created = await createPreset(name, extractPresetSettings(currentSettings));
      const next = await listPresets();
      setPresets(next);
      setPresetId(created.id);
      setPresetName('');
      onPresetIdChange(created.id);
      addToast(`Saved preset "${created.name}"`, 'success');
    } catch {
      addToast('Failed to save preset', 'error');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleUpdatePreset = async () => {
    if (!currentPresetId) return;
    setUpdatingPreset(true);
    try {
      const updated = await updatePreset(currentPresetId, extractPresetSettings(currentSettings));
      const next = await listPresets();
      setPresets(next);
      setPresetId(updated.id);
      addToast(`Updated preset "${updated.name}"`, 'success');
    } catch {
      addToast('Failed to update preset', 'error');
    } finally {
      setUpdatingPreset(false);
    }
  };

  if (!activeProjectId) return null;

  return (
    <Section title="Presets">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Current preset</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                background: '#0a0a0a',
                color: currentPresetMeta ? '#ddd' : '#666',
                border: '1px solid #333',
                padding: '4px 6px',
                borderRadius: 3,
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              {currentPresetMeta?.name ?? currentPresetId ?? 'No preset linked'}
            </div>
            <button
              onClick={handleUpdatePreset}
              disabled={!currentPresetId || updatingPreset}
              style={{
                padding: '4px 12px',
                background: currentPresetId && !updatingPreset ? '#1f6feb' : '#222',
                color: currentPresetId && !updatingPreset ? '#fff' : '#666',
                border: 'none',
                borderRadius: 3,
                cursor: currentPresetId && !updatingPreset ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {updatingPreset ? 'Updating...' : 'Update Preset'}
            </button>
          </div>
        </div>

        <div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Save as preset</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              style={{
                flex: 1,
                background: '#0a0a0a',
                color: '#ddd',
                border: '1px solid #333',
                padding: '4px 6px',
                borderRadius: 3,
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            />
            <button
              onClick={handleSavePreset}
              disabled={!presetName.trim() || savingPreset}
              style={{
                padding: '4px 12px',
                background: presetName.trim() && !savingPreset ? '#1f6feb' : '#222',
                color: presetName.trim() && !savingPreset ? '#fff' : '#666',
                border: 'none',
                borderRadius: 3,
                cursor: presetName.trim() && !savingPreset ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {savingPreset ? 'Saving...' : 'Save As Preset'}
            </button>
          </div>
        </div>

        <div>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Apply saved preset</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              style={{
                flex: 1,
                background: '#0a0a0a',
                color: '#ddd',
                border: '1px solid #333',
                padding: '4px 6px',
                borderRadius: 3,
                fontFamily: 'inherit',
                fontSize: 12,
              }}
            >
              <option value="">Select preset...</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            <button
              onClick={handleImportPreset}
              disabled={!presetId || importingPreset}
              style={{
                padding: '4px 12px',
                background: presetId && !importingPreset ? '#1f6feb' : '#222',
                color: presetId && !importingPreset ? '#fff' : '#666',
                border: 'none',
                borderRadius: 3,
                cursor: presetId && !importingPreset ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {importingPreset ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>

        {otherProjects.length > 0 && (
          <div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Import from project</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={sourceProjectId}
                onChange={(e) => setSourceProjectId(e.target.value)}
                style={{
                  flex: 1,
                  background: '#0a0a0a',
                  color: '#ddd',
                  border: '1px solid #333',
                  padding: '4px 6px',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                <option value="">Select project...</option>
                {otherProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <button
                onClick={handleImportProject}
                disabled={!sourceProjectId || importingProject}
                style={{
                  padding: '4px 12px',
                  background: sourceProjectId && !importingProject ? '#1f6feb' : '#222',
                  color: sourceProjectId && !importingProject ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: 3,
                  cursor: sourceProjectId && !importingProject ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {importingProject ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ color: '#555', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        Presets save background, video, captions, reactivity, mixer, layer, and crop-guide settings.
      </div>
      <div style={{ color: '#555', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
        They do not save imported media, transcript content, music timeline placement, clip edits, jump cuts, or export ranges.
      </div>
    </Section>
  );
};
