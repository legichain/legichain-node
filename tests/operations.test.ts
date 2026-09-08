import { describe,it,expect } from "vitest";
import { Legichain } from "../src/client.js";

describe("explicit V2 operations",()=>{
  it("keeps uncertain POST keys, does not poll, and leaves V1 unchanged",async()=>{
    const seen:{url:string;options:RequestInit}[]=[];
    const fetcher:typeof fetch=async(input,init)=>{
      seen.push({url:String(input),options:init!});
      if(seen.length===1)throw new Error("Synthetic response loss");
      return new Response(JSON.stringify({operation_id:"tr_op",status:"queued",status_url:"/v2/operations/tr_op",protocol:1}),{status:202,headers:{"Content-Type":"application/json"}});
    };
    const lc=new Legichain({apiKey:"synthetic",region:"tr",fetch:fetcher});
    await expect(lc.operations.screen("person",{name:"Synthetic"},"stable-key")).rejects.toThrow();
    const receipt=await lc.operations.screen("person",{name:"Synthetic"},"stable-key");
    expect(receipt.status).toBe("queued");expect(seen.length).toBe(2);
    expect(seen[0].options.body).toBe(seen[1].options.body);
    expect((seen[1].options.headers as Record<string,string>)["Idempotency-Key"]).toBe("stable-key");
    await lc.operations.kycEvidence("tr_app","nfc",{access_error:"synthetic"},"nfc","token");
    expect((seen.at(-1)!.options.headers as Record<string,string>)["X-KYC-Client-Token"]).toBe("token");
    await lc.operations.report("wallet",{address:"synthetic",format:"pdf"},"report");
    await lc.operations.kycReport("tr_app",{decision_id:"synthetic"},"kyc-report");
    await lc.operations.addressSubmit("tr_av","av");
    await lc.operations.get("tr_op");await lc.operations.task("tr_op","task");
    await lc.operations.list({state:"failed",limit:25});expect(seen.at(-1)!.url).toContain("limit=25");
    await lc.operations.cancel("tr_op");
    await lc.screen.person({name:"Synthetic"});expect(seen.at(-1)!.url).toContain("/v1/screen/person");
    const count=seen.length;
    await expect(lc.operations.screen("person",{name:"Synthetic"},"")).rejects.toThrow();
    expect(seen.length).toBe(count);
  });
});
