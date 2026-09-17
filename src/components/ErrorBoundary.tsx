import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 text-slate-900" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 shadow-xl text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">حدث خطأ غير متوقع في واجهة النظام</h2>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              تم احتواء الخطأ عبر طبقة الأمان (Error Boundary) لحماية البيانات المحاسبية وسجلات الجلسة.
            </p>
            {this.state.error && (
              <pre className="mb-6 p-3 bg-slate-100 rounded-lg text-start text-[11px] font-mono text-rose-800 overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
              startIcon={<RotateCcw className="w-4 h-4" />}
            >
              إعادة تحميل الصفحة
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
