import React from 'react';
import { useI18n } from '../../i18n/context.js';
import { Button } from '../ui/Button.js';
import { Badge } from '../ui/Badge.js';
import { AlertTriangle, Wrench, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';

export const NotFoundView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { t, direction } = useI18n();

  return (
    <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-200 shadow-md text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-2xl mb-4">
        404
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">{t.errors.notFoundTitle}</h2>
      <p className="text-xs sm:text-sm text-slate-500 mb-6">{t.errors.notFoundSubtitle}</p>
      <Button variant="primary" onClick={() => onNavigate('/')} className="w-full">
        {t.errors.backHome}
      </Button>
    </div>
  );
};

export const MaintenanceView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-200 shadow-md text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
        <Wrench className="w-7 h-7" />
      </div>
      <Badge variant="warning" className="mb-3">
        {t.errors.systemHealthy}
      </Badge>
      <h2 className="text-xl font-bold text-slate-900 mb-2">{t.errors.maintenanceTitle}</h2>
      <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
        {t.errors.maintenanceSubtitle}
      </p>
      <Button variant="outline" onClick={() => onNavigate('/')} className="w-full">
        {t.errors.backHome}
      </Button>
    </div>
  );
};

export const ModuleShellView: React.FC<{
  title: string;
  phaseCode: string;
  description: string;
  onNavigate: (route: string) => void;
}> = ({ title, phaseCode, description, onNavigate }) => {
  return (
    <div className="max-w-2xl mx-auto my-8 p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-4">
        <ShieldCheck className="w-6 h-6" />
      </div>
      <Badge variant="brand" className="mb-3">
        {phaseCode}
      </Badge>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-sm text-slate-600 mb-6 max-w-lg mx-auto leading-relaxed">{description}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={() => onNavigate('/roadmap')}>
          استعراض متطلبات المرحلة في الخارطة
        </Button>
        <Button variant="outline" onClick={() => onNavigate('/')}>
          العودة للوحة التحكم
        </Button>
      </div>
    </div>
  );
};
