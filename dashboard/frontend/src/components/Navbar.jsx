import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('auth_token');
        navigate('/login');
    };

    const navStyle = {
        backgroundColor: 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        borderBottom: '1px solid #e5e7eb',
    };

    const containerStyle = {
        maxWidth: '80rem',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: '1rem',
        paddingRight: '1rem',
    };

    const contentStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        height: '64px',
    };

    const leftSideStyle = {
        display: 'flex',
        alignItems: 'center',
    };

    const logoLinkStyle = {
        display: 'flex',
        alignItems: 'center',
        textDecoration: 'none',
    };

    const logoBgStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        backgroundColor: '#2563eb',
        borderRadius: '8px',
        marginRight: '12px',
    };

    const logoTextStyle = {
        fontSize: '20px',
        fontWeight: 'bold',
        color: '#111827',
        textDecoration: 'none',
    };

    const rightSideStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
    };

    const linkStyle = {
        paddingLeft: '12px',
        paddingRight: '12px',
        paddingTop: '8px',
        paddingBottom: '8px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#4b5563',
        textDecoration: 'none',
        cursor: 'pointer',
    };

    const buttonStyle = {
        marginLeft: '1rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        paddingTop: '8px',
        paddingBottom: '8px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#4b5563',
        backgroundColor: 'white',
        cursor: 'pointer',
    };

    return (
        <nav style={navStyle}>
            <div style={containerStyle}>
                <div style={contentStyle}>
                    <div style={leftSideStyle}>
                        <Link to="/" style={logoLinkStyle}>
                            <div style={logoBgStyle}>
                                <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <span style={logoTextStyle}>Health Dashboard</span>
                        </Link>
                    </div>

                    <div style={rightSideStyle}>
                        <Link
                            to="/"
                            style={linkStyle}
                            onMouseOver={(e) => {
                                e.target.style.color = '#111827';
                                e.target.style.backgroundColor = '#f3f4f6';
                            }}
                            onMouseOut={(e) => {
                                e.target.style.color = '#4b5563';
                                e.target.style.backgroundColor = 'transparent';
                            }}
                        >
                            Dashboard
                        </Link>
                        <Link
                            to="/servers"
                            style={linkStyle}
                            onMouseOver={(e) => {
                                e.target.style.color = '#111827';
                                e.target.style.backgroundColor = '#f3f4f6';
                            }}
                            onMouseOut={(e) => {
                                e.target.style.color = '#4b5563';
                                e.target.style.backgroundColor = 'transparent';
                            }}
                        >
                            Servers
                        </Link>
                        <Link
                            to="/settings"
                            style={linkStyle}
                            onMouseOver={(e) => {
                                e.target.style.color = '#111827';
                                e.target.style.backgroundColor = '#f3f4f6';
                            }}
                            onMouseOut={(e) => {
                                e.target.style.color = '#4b5563';
                                e.target.style.backgroundColor = 'transparent';
                            }}
                        >
                            Settings
                        </Link>
                        <button
                            onClick={handleLogout}
                            style={buttonStyle}
                            onMouseOver={(e) => e.target.style.backgroundColor = '#f9fafb'}
                            onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
