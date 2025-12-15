import React from 'react';
import './StarBorder.css';

interface StarBorderProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
    color?: string;
    speed?: string;
    thickness?: number;
    className?: string;
    children?: React.ReactNode;
}

const StarBorder: React.FC<StarBorderProps> = ({
    as: Component = 'div', // Changed default to div as it's safer for containers
    className = '',
    color = 'white',
    speed = '6s',
    thickness = 1,
    children,
    ...rest
}) => {
    return (
        <Component
            className={`star-border-container ${className}`}
            style={{
                position: 'relative', // Ensure relative positioning
                padding: '1px', // Use padding to create the border effect area if needed, or rely on absolute positioning of gradients
                ...rest.style
            }}
            {...rest}
        >
            <div
                className="border-gradient-bottom"
                style={{
                    background: `radial-gradient(circle, ${color}, transparent 40%)`,
                    animationDuration: speed
                }}
            ></div>
            <div
                className="border-gradient-top"
                style={{
                    background: `radial-gradient(circle, ${color}, transparent 40%)`,
                    animationDuration: speed
                }}
            ></div>
            <div className="inner-content" style={{ background: 'transparent', border: 'none', padding: 0, borderRadius: 'inherit' }}>
                {children}
            </div>
        </Component>
    );
};

export default StarBorder;
