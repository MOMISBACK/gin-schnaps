import { isDesktop, nativeCall } from '../adapters/desktop';
import { chooseRecoveryCopy, parseRecovery, RecoveryStore, type RecoveryState } from './recovery';
export type RecoveryBackend = Pick<RecoveryStore,'read'|'write'|'clear'|'close'>;
class NativeRecovery implements RecoveryBackend {
  async read():Promise<RecoveryState>{
    const raw=await nativeCall<{enabled:boolean;revision:number;current:string|null;previous:string|null}>('desktop_recovery_read');
    if(!Number.isSafeInteger(raw.revision)||raw.revision<0)throw new Error('Invalid native recovery revision.');
    const chosen=chooseRecoveryCopy(raw.current??undefined,raw.previous??undefined);
    return {...chosen,revision:raw.revision,enabled:chosen.error?false:raw.enabled};
  }
  async write(text:string,expected:number):Promise<number>{
    parseRecovery(text);return nativeCall('desktop_recovery_write',{text,expected});
  }
  async clear(expected:number):Promise<number>{return nativeCall('desktop_recovery_write',{text:null,expected});}
  close():void{}
}
export function openRecoveryBackend():Promise<RecoveryBackend>{
  return isDesktop()?Promise.resolve(new NativeRecovery()):RecoveryStore.open();
}
