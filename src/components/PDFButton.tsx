'use client';

import { useState, useRef } from 'react';
import { Download, Loader2, FileText } from 'lucide-react';
import { AnalysisResult } from '@/types';
import PdfReport from './pdf/PdfReport';

interface Props {
  results: AnalysisResult[];
  top?: number;
  surname?: string;
  gender?: string;
  dateRange?: string;
}

export default function PDFButton({ results, top = 20, surname = '', gender = '', dateRange }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [showReport, setShowReport] = useState(false);

  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    setProgress('리포트 렌더링 중...');

    try {
      // Step 1: Render the report into the hidden container
      setShowReport(true);

      // Step 2: Wait for React render + fonts to load
      await new Promise(r => setTimeout(r, 600));
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 400));

      setProgress('페이지 캡처 중...');

      // Step 3: Find all pages
      const container = containerRef.current;
      if (!container) throw new Error('Report container not found');

      const pages = container.querySelectorAll<HTMLElement>('.pdf-page');
      if (pages.length === 0) throw new Error('No PDF pages found');

      // Step 4: Import libraries
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      // Step 5: Capture each page
      for (let i = 0; i < pages.length; i++) {
        setProgress(`페이지 변환 중... ${i + 1}/${pages.length}`);

        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: pages[i].style.backgroundColor || '#FFFFFF',
          width: 794,
          height: 1123,
          windowWidth: 794,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.93);

        if (i > 0) doc.addPage();
        doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      setProgress('PDF 저장 중...');

      // Step 6: Save
      const dateStr = new Date().toISOString().slice(0, 10);
      const nameStr = results[0]?.name.full ?? 'report';
      doc.save(`destiny-lab-${nameStr}-${dateStr}.pdf`);

    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setShowReport(false);
      setLoading(false);
      setProgress('');
    }
  };

  const topResults = results.slice(0, top);

  return (
    <>
      <button
        onClick={handleExport}
        disabled={loading || results.length === 0}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">{progress || '처리 중...'}</span>
          </>
        ) : (
          <>
            <FileText className="w-4 h-4" />
            프리미엄 PDF
          </>
        )}
      </button>

      {/* Hidden report container for html2canvas capture */}
      {showReport && (
        <div
          ref={containerRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
            zIndex: -1,
            width: '794px',
            // Noto Sans KR explicit font-face
            fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif",
          }}
          aria-hidden
        >
          <PdfReport
            results={topResults}
            surname={surname}
            gender={gender}
            dateRange={dateRange}
          />
        </div>
      )}
    </>
  );
}
