import {PublicKey,Connection} from '@solana/web3.js';
export class SquadsReadAdapter{
 async inspect(connection:Connection){const address=(process.env.SQUADS_MULTISIG_ADDRESS||'').trim();if(!address)return {configured:false};try{const multisig=await import('@sqds/multisig');const multisigPda=new PublicKey(address);const account=await multisig.accounts.Multisig.fromAccountAddress(connection,multisigPda);const [vault]=multisig.getVaultPda({multisigPda,index:0});return {configured:true,multisigAddress:multisigPda.toBase58(),vaultAddress:vault.toBase58(),members:account.members.map((m:any)=>({key:m.key?.toBase58?.()||String(m.key),permissions:m.permissions})),threshold:account.threshold?.toString?.()||String(account.threshold)}}catch(e:any){return {configured:true,error:e.message}}}
}
