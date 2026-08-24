import React from 'react';
import type { MainTab } from '../../lib/constants';
import type { SidebarPanelProps } from './SidebarPanel.types';
import { C } from '../../lib/designTokens';
import { ProjectStatusPanel } from '../ProjectStatusPanel';

const PANEL_NAME: Record<MainTab, string> = {
  background: 'Background',
  video: 'Video',
  metal: 'Metal Camera',
  captions: 'Captions',
  audio: 'Audio',
  editor: 'Editor',
  export: 'Export',
};

/* Collapsed sidebar header: the active panel name + project status. Layer /
   mode / guide / tab controls now live in the full-width TopBar. */
export const SidebarHeader: React.FC<Pick<
  SidebarPanelProps,
  'mainTab' | 'audioMode' | 'activeProject' | 'projectStatus'
>> = (p) => (
  <div style={{ flexShrink: 0 }}>
    <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.line}`, background: C.bg }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
        {p.mainTab === 'video' && p.audioMode ? 'Visualizer' : PANEL_NAME[p.mainTab]}
      </span>
    </div>
    {p.mainTab !== 'metal' && (
      <ProjectStatusPanel project={p.activeProject} status={p.projectStatus} />
    )}
  </div>
);
