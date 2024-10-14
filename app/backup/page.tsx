"use client"
import React, { useState } from 'react';
import { Button } from 'antd';
import axios from 'axios';

export default function Page() {
    const [fileData, setFileData] = useState(null);
    const [importFileData, setImportFileData] = useState(null);

    const handleFileChange = (event: any) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                const content = e.target.result;
                setFileData(JSON.parse(content))
                setImportFileData(JSON.parse(content)); // Parse JSON content
            };
            reader.readAsText(file);
        }
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json' }); // Export as JSON
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'exported_data.json'; // Change file extension to .json
        link.click();
    };

    const handleImport = async () => {
        await axios.post('/api/backup', importFileData)
        return setImportFileData(null)
    }
    const loadData = () => axios.get('/api/backup').then(res => setFileData(res.data.data))


    return (
        <div >
            <h1>File Import/Export</h1>
            <div className='flex gap-4'>
                <input type="file" accept=".json" onChange={handleFileChange} /> {/* Accept only JSON files */}
                <Button onClick={loadData} disabled={fileData !== null}>
                    Load Data To Export
                </Button>
                <Button onClick={handleExport} disabled={!fileData}>
                    Export Data
                </Button>
                <Button onClick={handleImport} disabled={!importFileData}>
                    Import Data
                </Button>
            </div>
            {fileData && <pre>{JSON.stringify(fileData, null, 2)}</pre>} {/* Display JSON data */}
        </div>
    );
}
