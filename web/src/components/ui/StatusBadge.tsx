import Badge, { statusTone } from './Badge'

export default function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>
}
