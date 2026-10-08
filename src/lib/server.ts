import "server-only";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, records, schools, sessions, users } from "@/db/schema";
import { makeDemoRecords, schoolSettings } from "./demo";

export const SESSION_COOKIE = "ams_session";
const THIRTY_MINUTES = 30 * 60 * 1000;
const hashToken = (token:string)=>createHash("sha256").update(token).digest("hex");
export const cookieSecure = process.env.COOKIE_SECURE === undefined
  ? process.env.NODE_ENV === "production"
  : process.env.COOKIE_SECURE.toLowerCase() !== "false";

export async function ensureSeed(){
  let [school] = await db.select().from(schools).limit(1);
  if(!school){
    const demo = process.env.ENABLE_DEMO === "true";
    [school] = await db.insert(schools).values({nameEn:demo?"Shantipur Government Primary School":"My School",nameBn:demo?"শান্তিপুর সরকারি প্রাথমিক বিদ্যালয়":"আমার বিদ্যালয়",settings:schoolSettings,demoMode:demo}).returning();
    if(!demo) return school;
    const adminHash=await hash("Demo@2026",12), teacherHash=await hash("Teacher@2026",12), studentHash=await hash("4821",12);
    await db.insert(users).values([
      {schoolId:school.id,role:"admin",name:"Kamrul Hasan",email:"admin@demo.ams",passwordHash:adminHash},
      {schoolId:school.id,role:"teacher",name:"Sharmin Akter",email:"teacher@demo.ams",mobile:"01711000002",passwordHash:teacherHash,entityId:"teacher-2"},
      {schoolId:school.id,role:"student",name:"Arif Hasan",admissionNo:"AMS-2026-0001",dob:"2015-01-01",passwordHash:studentHash,entityId:"student-1"},
    ]);
    const admin=(await db.select().from(users).where(and(eq(users.schoolId,school.id),eq(users.role,"admin"))).limit(1))[0];
    const seed=makeDemoRecords();
    const size=400;
    for(let i=0;i<seed.length;i+=size) await db.insert(records).values(seed.slice(i,i+size).map(r=>({...r,schoolId:school.id,createdBy:admin.id})));
    await db.insert(auditLogs).values({schoolId:school.id,userId:admin.id,actor:"System",action:"seed.loaded",resourceType:"settings",details:{records:seed.length}});
  }
  return school;
}

export type SafeUser={id:string;schoolId:string;role:string;name:string;email:string|null;entityId:string|null};
export async function getSession():Promise<SafeUser|null>{
  const store=await cookies(); const raw=store.get(SESSION_COOKIE)?.value; if(!raw)return null;
  const rows=await db.select({session:sessions,user:users}).from(sessions).innerJoin(users,eq(sessions.userId,users.id)).where(and(eq(sessions.tokenHash,hashToken(raw)),gt(sessions.expiresAt,new Date()),eq(users.active,true))).limit(1);
  if(!rows[0]) return null;
  const u=rows[0].user; return {id:u.id,schoolId:u.schoolId,role:u.role,name:u.name,email:u.email,entityId:u.entityId};
}
export async function createSession(userId:string){
  const token=randomBytes(32).toString("base64url");
  await db.insert(sessions).values({userId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+THIRTY_MINUTES)});
  const store=await cookies(); store.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:cookieSecure,maxAge:1800,path:"/"});
}
export async function clearSession(){const store=await cookies(); const raw=store.get(SESSION_COOKIE)?.value;if(raw)await db.delete(sessions).where(eq(sessions.tokenHash,hashToken(raw)));store.delete(SESSION_COOKIE)}
export async function verifyPassword(plain:string,hashed:string){return compare(plain,hashed)}
export async function hashPassword(plain:string){return hash(plain,12)}

const adminOnly=new Set(["payment","feeType","certificate","audit","settings"]);
export async function allowedRecords(user:SafeUser,type?:string){
  if(user.role==="admin") return type?[type]:undefined;
  if(user.role==="teacher") return type?[type].filter(x=>!adminOnly.has(x)):undefined;
  return type?[type].filter(x=>["student","notice","holiday","syllabus","routine","result","attendance","payment"].includes(x)):undefined;
}
export function canWrite(user:SafeUser,type:string,data:Record<string,unknown>){
  if(user.role==="admin")return true;
  if(user.role==="teacher") return ["attendance","leave","submission"].includes(type) && (!data.teacherId||data.teacherId===user.entityId);
  return false;
}
export async function fetchRecords(user:SafeUser,type?:string){
  const base=[eq(records.schoolId,user.schoolId),isNull(records.deletedAt)];
  if(type)base.push(eq(records.type,type));
  let all=await db.select().from(records).where(and(...base));
  if(user.role==="teacher"){
    if(type&&adminOnly.has(type))return [];
    if(type==="teacher"||!type) all=all.filter(r=>r.type!=="teacher"||r.id===user.entityId);
  }
  if(user.role==="student"){
    const allowed=["student","notice","holiday","syllabus","routine","result","attendance","payment"];
    all=all.filter(r=>allowed.includes(r.type));
    const me=all.find(r=>r.type==="student"&&r.id===user.entityId); const cls=(me?.data as Record<string,unknown>)?.class;
    all=all.filter(r=>r.type!=="student"?(["result","attendance","payment"].includes(r.type)?(r.data as Record<string,unknown>).studentId===user.entityId:["syllabus","routine"].includes(r.type)?(r.data as Record<string,unknown>).class===cls:true):r.id===user.entityId);
  }
  return all;
}
export async function logAudit(user:SafeUser,action:string,resourceType:string,resourceId?:string,details:Record<string,unknown>={}){await db.insert(auditLogs).values({schoolId:user.schoolId,userId:user.id,actor:user.name,action,resourceType,resourceId,details})}
