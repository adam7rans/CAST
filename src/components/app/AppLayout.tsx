import type React from 'react';
import { PreviewArea } from '../PreviewArea';
import { SidebarPanel } from '../panels/SidebarPanel';
import { PreviewTimeline } from '../timeline/PreviewTimeline';
import { TopBar } from '../TopBar';

interface Props {
  previewAreaProps: React.ComponentProps<typeof PreviewArea>;
  timelineProps: React.ComponentProps<typeof PreviewTimeline>;
  sidebarProps: React.ComponentProps<typeof SidebarPanel>;
}

/* "Tabs" layout: full-width top bar → (preview | 400px right panel) →
   full-width bottom timeline. */
export const AppLayout: React.FC<Props> = ({ previewAreaProps, timelineProps, sidebarProps }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, overflow: 'hidden' }}>
    <TopBar {...sidebarProps} />
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
        <PreviewArea {...previewAreaProps} />
      </div>
      <div style={{ width: 400, flexShrink: 0, minHeight: 0 }}>
        <SidebarPanel {...sidebarProps} />
      </div>
    </div>
    <PreviewTimeline {...timelineProps} />
  </div>
);
