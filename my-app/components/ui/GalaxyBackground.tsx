import React from 'react';

interface GalaxyBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export function GalaxyBackground({ children, className = '' }: GalaxyBackgroundProps) {
  return (
    <div className={`relative flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 overflow-hidden ${className}`}>
      {/* Galaxy Background - Elegant gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 via-slate-800 to-black">
        {/* Subtle gradient overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-40"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-transparent to-slate-800 opacity-30"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-transparent to-purple-950/20"></div>
        
        {/* Stars - Animated */}
        <div className="absolute inset-0">
          {/* Small stars */}
          <div className="absolute top-[15%] left-[20%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0s' }}></div>
          <div className="absolute top-[25%] right-[30%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '1.2s' }}></div>
          <div className="absolute top-[35%] left-[45%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '2.1s' }}></div>
          <div className="absolute top-[45%] left-[15%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0.8s' }}></div>
          <div className="absolute top-[55%] right-[25%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '1.9s' }}></div>
          <div className="absolute top-[65%] left-[35%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0.4s' }}></div>
          <div className="absolute top-[75%] right-[40%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '2.7s' }}></div>
          <div className="absolute top-[85%] left-[25%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '1.5s' }}></div>
          <div className="absolute top-[10%] right-[15%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0.6s' }}></div>
          <div className="absolute top-[20%] left-[60%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '2.3s' }}></div>
          <div className="absolute top-[30%] right-[50%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '1.8s' }}></div>
          <div className="absolute top-[40%] left-[70%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0.9s' }}></div>
          <div className="absolute top-[50%] right-[10%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '2.5s' }}></div>
          <div className="absolute top-[60%] left-[80%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '1.1s' }}></div>
          <div className="absolute top-[70%] right-[20%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0.3s' }}></div>
          <div className="absolute top-[80%] left-[90%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '2.0s' }}></div>
          <div className="absolute top-[90%] right-[35%] w-0.5 h-0.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '1.7s' }}></div>
          
          {/* Additional small stars for more density */}
          <div className="absolute top-[12%] left-[35%] w-0.5 h-0.5 bg-gray-300 rounded-full animate-star-twinkle" style={{ animationDelay: '1.4s' }}></div>
          <div className="absolute top-[32%] right-[18%] w-0.5 h-0.5 bg-gray-300 rounded-full animate-star-twinkle" style={{ animationDelay: '0.7s' }}></div>
          <div className="absolute top-[52%] left-[75%] w-0.5 h-0.5 bg-gray-300 rounded-full animate-star-twinkle" style={{ animationDelay: '2.8s' }}></div>
          <div className="absolute top-[72%] right-[65%] w-0.5 h-0.5 bg-gray-300 rounded-full animate-star-twinkle" style={{ animationDelay: '1.1s' }}></div>
          <div className="absolute top-[92%] left-[55%] w-0.5 h-0.5 bg-gray-300 rounded-full animate-star-twinkle" style={{ animationDelay: '0.5s' }}></div>
          
          {/* Medium stars - different colors for realism */}
          <div className="absolute top-[18%] right-[22%] w-1 h-1 bg-blue-100 rounded-full animate-star-twinkle" style={{ animationDelay: '0.7s' }}></div>
          <div className="absolute top-[38%] left-[28%] w-1 h-1 bg-yellow-100 rounded-full animate-star-twinkle" style={{ animationDelay: '1.3s' }}></div>
          <div className="absolute top-[58%] right-[38%] w-1 h-1 bg-blue-100 rounded-full animate-star-twinkle" style={{ animationDelay: '0.9s' }}></div>
          <div className="absolute top-[78%] left-[48%] w-1 h-1 bg-yellow-100 rounded-full animate-star-twinkle" style={{ animationDelay: '2.1s' }}></div>
          <div className="absolute top-[28%] right-[58%] w-1 h-1 bg-blue-100 rounded-full animate-star-twinkle" style={{ animationDelay: '1.6s' }}></div>
          <div className="absolute top-[48%] left-[68%] w-1 h-1 bg-yellow-100 rounded-full animate-star-twinkle" style={{ animationDelay: '0.5s' }}></div>
          <div className="absolute top-[68%] right-[12%] w-1 h-1 bg-blue-100 rounded-full animate-star-twinkle" style={{ animationDelay: '2.4s' }}></div>
          <div className="absolute top-[88%] left-[32%] w-1 h-1 bg-yellow-100 rounded-full animate-star-twinkle" style={{ animationDelay: '1.0s' }}></div>
          
          {/* Bright stars - larger and more prominent */}
          <div className="absolute top-[22%] left-[42%] w-1.5 h-1.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '0.2s' }}></div>
          <div className="absolute top-[42%] right-[32%] w-1.5 h-1.5 bg-yellow-200 rounded-full animate-star-twinkle" style={{ animationDelay: '1.8s' }}></div>
          <div className="absolute top-[62%] left-[52%] w-1.5 h-1.5 bg-blue-200 rounded-full animate-star-twinkle" style={{ animationDelay: '0.6s' }}></div>
          <div className="absolute top-[82%] right-[42%] w-1.5 h-1.5 bg-white rounded-full animate-star-twinkle" style={{ animationDelay: '2.2s' }}></div>
          
          {/* Very bright stars - the brightest ones with subtle float */}
          <div className="absolute top-[15%] right-[45%] w-2 h-2 bg-white rounded-full animate-star-twinkle animate-star-float" style={{ animationDelay: '0.1s' }}></div>
          <div className="absolute top-[55%] left-[25%] w-2 h-2 bg-yellow-300 rounded-full animate-star-twinkle animate-star-float" style={{ animationDelay: '1.9s' }}></div>
          <div className="absolute top-[85%] right-[25%] w-2 h-2 bg-blue-300 rounded-full animate-star-twinkle animate-star-float" style={{ animationDelay: '0.8s' }}></div>
        </div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
