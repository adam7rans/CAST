import type React from 'react';
import { PreviewArea } from '../PreviewArea';
import { SidebarPanel } from '../panels/SidebarPanel';
import { PreviewTimeline } from '../timeline/PreviewTimeline';
import { TopBar } from '../TopBar';
import { ProjectDashboard } from '../dashboard/ProjectDashboard';
import { DashboardContext, useDashboard } from './useDashboard';
import { useProjectSnapshot } from './useProjectSnapshot';

interface Props {
  previewAreaProps: React.ComponentProps<typeof PreviewArea>;
  timelineProps: React.ComponentProps<typeof PreviewTimeline>;
  sidebarProps: React.ComponentProps<typeof SidebarPanel>;
}

/* Layout: full-width top bar → (preview over timeline | 400px right panel
   running to the bottom of the window). The projects dashboard covers it when no
   project is open, or when reopened from the project bar; the editor stays
   mounted underneath so its WebGL renderers survive. */
export const AppLayout: React.FC<Props> = ({ previewAreaProps, timelineProps, sidebarProps }) => {
  const dashboard = useDashboard({
    activeProjectId: sidebarProps.activeProjectId,
    selectProject: sidebarProps.onSelectProject,
    createProject: sidebarProps.onCreateProject,
  });
  const p = previewAreaProps;
  useProjectSnapshot({
    previewWrapRef: p.previewWrapRef,
    activeProjectId: sidebarProps.activeProjectId,
    mediaLoaded: !!(p.videoInfo || p.audioInfo),
    savedAt: sidebarProps.saveStatus.at,
    dashboardVisible: dashboard.visible,
    backdrop: p.bgLayerOn ? '#000' : p.bgOffMode === 'color' ? p.bgOffColor : '#111',
    invert: !!p.activeExportParams.invertFinalOutput,
  });

  return (
    <DashboardContext.Provider value={dashboard}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0, overflow: 'hidden' }}>
        <TopBar {...sidebarProps} />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
            <PreviewArea {...previewAreaProps} />
            <PreviewTimeline {...timelineProps} />
          </div>
          {/* The sidebar runs to the bottom of the window; the timeline sits under the preview only. */}
          <div style={{ width: 400, flexShrink: 0, minHeight: 0, borderLeft: '1px solid #1f1f1f' }}>
            <SidebarPanel {...sidebarProps} />
          </div>
        </div>
      </div>
      {dashboard.visible && <ProjectDashboard control={dashboard} />}
    </DashboardContext.Provider>
  );
};
