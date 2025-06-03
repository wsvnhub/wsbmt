import CellCount from '@/components/CellCount'
import SettingPage from '@/components/Settings'
import clientPromise from '@/lib/mongo';
import React from 'react'


const getBranchs = async () => {
  const client = await clientPromise;
  const db = client.db();
  return db.collection("facilities").find({}).toArray();
}

export default async function page() {
  const branchs = await getBranchs()
  return (
    <div>
      <CellCount branches={branchs} />
      <SettingPage />
    </div>
  )
}
