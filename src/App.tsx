import { useInteractionMode } from './hooks/useInteractionMode'
import { useInsight } from './insight/useInsight'
import { Dashboard } from './ui/Dashboard'

/**
 * The only place that talks to the signal pipeline. Everything below this
 * component reads mode and signals from props and never decides a mode.
 */
export default function App() {
  const model = useInteractionMode()
  const insight = useInsight(model.state.mode, model.state.focusTarget)
  return <Dashboard model={model} insight={insight} />
}
