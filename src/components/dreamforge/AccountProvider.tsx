"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
type User={id:string;email?:string};
type Account={user:User|null;loading:boolean;error:string;refresh:()=>Promise<void>};
const Context=createContext<Account>({user:null,loading:true,error:"",refresh:async()=>{}});
export const useAccount=()=>useContext(Context);
export default function AccountProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");const version=useRef(0);
 const refresh=useCallback(async()=>{const id=++version.current;try{const r=await fetch('/api/account',{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error?.message??'Could not load your account.');if(id===version.current){setUser(body.user);setError('');}}catch(e){if(id===version.current){setUser(null);setError(e instanceof Error?e.message:'Could not load your account.');}}finally{if(id===version.current)setLoading(false);}},[]);
 useEffect(()=>{void refresh();const onFocus=()=>void refresh();window.addEventListener('focus',onFocus);window.addEventListener('dreamforge-session',onFocus);return()=>{version.current++;window.removeEventListener('focus',onFocus);window.removeEventListener('dreamforge-session',onFocus);};},[refresh]);
 return <Context.Provider value={{user,loading,error,refresh}}>{children}</Context.Provider>;
}
