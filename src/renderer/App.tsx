import React from 'react'

function App() {
  const handleOpenLogin = () => {
    // Example login URL - Replace with actual
    window.open('https://accounts.kakao.com/login', '_blank');
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#1e1e1e', color: 'white', height: '100vh' }}>
      <h1>POE2 Unofficial Launcher</h1>
      <p>환영합니다. POE2 비공식 런처입니다.</p>
      
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={handleOpenLogin}
          style={{ padding: '10px 20px', cursor: 'pointer', background: '#f5e000', border: 'none', color: '#3c1e1e', fontWeight: 'bold' }}
        >
          카카오 로그인 (테스트)
        </button>
      </div>
    </div>
  )
}

export default App
