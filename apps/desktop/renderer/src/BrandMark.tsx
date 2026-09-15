import {useId} from 'react';

/**
 * 结阵标志：一枚精灵球的球壳截成六瓣，对应六个队伍位置。
 * 上方三瓣与正下方一瓣已经落定，左右下两瓣只留描边表示尚未补齐；正上方那瓣是绿色核心。
 * 上半浅紫、下半白，加粗的赤道带与中心按钮保持精灵球读法。
 * 几何与 assets/app-icon.svg 完全一致，这里内联成 SVG，任意尺寸都清晰。
 */
export function BrandMark({size = 36, className}: {size?: number; className?: string}) {
  const id = useId().replace(/:/g, '');
  const maskId = `six-slots-${id}`;
  return (
    <svg className={className ? `brand-mark ${className}` : 'brand-mark'} width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="结阵 Sixfold：精灵球截成六瓣，四瓣已定、两瓣待补，正上方为核心">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          {/* 完整球壳为可见区 */}
          <circle cx="256" cy="256" r="192" fill="#fff"/>
          {/* 瓣间切口 */}
          <g stroke="#000" strokeWidth="22">
            <line x1="256" y1="256" x2="148" y2="68.9"/>
            <line x1="256" y1="256" x2="364" y2="68.9"/>
            <line x1="256" y1="256" x2="364" y2="443.1"/>
            <line x1="256" y1="256" x2="148" y2="443.1"/>
          </g>
          {/* 左下与右下两瓣留空 */}
          <path d="M256 256 L448 256 A192 192 0 0 1 352 422.3 Z" fill="#000"/>
          <path d="M256 256 L160 422.3 A192 192 0 0 1 64 256 Z" fill="#000"/>
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <circle cx="256" cy="256" r="192" fill="#ffffff"/>
        <path d="M64 256 A192 192 0 0 1 448 256 Z" fill="#c3b2ee"/>
        <path d="M256 256 L160 89.7 A192 192 0 0 1 352 89.7 Z" fill="#c9ecc0"/>
        <rect x="64" y="236" width="384" height="40" fill="#3f2b6e"/>
      </g>
      <g fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="8" strokeLinejoin="round">
        <path d="M256 256 L448 256 A192 192 0 0 1 352 422.3 Z"/>
        <path d="M256 256 L160 422.3 A192 192 0 0 1 64 256 Z"/>
      </g>
      <circle cx="256" cy="256" r="80" fill="#ffffff"/>
      <circle cx="256" cy="256" r="60" fill="none" stroke="#3f2b6e" strokeWidth="16"/>
      <circle cx="256" cy="256" r="26" fill="#c9ecc0"/>
    </svg>
  );
}
