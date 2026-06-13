import {
  Truck,
  Shield,
  FileText,
  FileSearch,
  Bot,
  Calculator,
  FolderOpen,
  Settings,
  Globe,
  Package,
  BarChart3,
  Zap,
  Lock,
  Users,
  Check,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Truck,
  Shield,
  FileText,
  FileSearch,
  Bot,
  Calculator,
  FolderOpen,
  Settings,
  Globe,
  Package,
  BarChart3,
  Zap,
  Lock,
  Users,
  Check,
  ArrowRight,
};

interface IconProps {
  name: string;
  className?: string;
}

export function Icon({ name, className }: IconProps) {
  const LucideIcon = iconMap[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className} />;
}

export { iconMap };
