#include "../../firmware/ReleasePolicy.h"
#include <cassert>
#include <fstream>
#include <iterator>
#include <iostream>
using namespace sentinela;
int main(int argc,char**argv){
 const std::string prefix="https://updates.example.org/releases/";
 const std::string base="sentinelacpd-esp32-v1\n0.4.0\n4\n1024\n"+std::string(64,'a')+"\n"+prefix+"app.bin\n"+std::string(512,'a')+"\n";
 Release r;
 assert(releasePolicy(base,prefix,3,3,0,2000000,r));
 assert(!releasePolicy(base,prefix,4,3,0,2000000,r));
 assert(!releasePolicy(base,prefix,3,5,0,2000000,r));
 assert(!releasePolicy(base,prefix,3,3,4,2000000,r));
 assert(!releasePolicy(base,prefix,3,3,0,1023,r));
 assert(!releasePolicy(base,"",3,3,0,2000000,r));
 assert(!releasePolicy(base+"extra\n",prefix,3,3,0,2000000,r));
 auto change=[&](std::string a,std::string b){auto t=base;t.replace(t.find(a),a.size(),b);return t;};
 for(auto url:{"http://updates.example.org/releases/app.bin","https://evil.test/app.bin","https://updates.example.org/releases/../app.bin","https://updates.example.org/releases/%2e%2e/app.bin","https://updates.example.org/releases/app.bin?token=x"})
  assert(!releasePolicy(change(prefix+"app.bin",url),prefix,3,3,0,2000000,r));
 assert(!releasePolicy(change("\n4\n","\n4294967296\n"),prefix,3,3,0,2000000,r));
 assert(!releasePolicy(change("esp32-v1","esp32-v2"),prefix,3,3,0,2000000,r));
 auto null=base;null[4]='\0';assert(!releasePolicy(null,prefix,3,3,0,2000000,r));
 PowerFilter power;assert(power.state==-1);
 assert(!power.update(1,UINT32_MAX-1000));assert(!power.update(1,1998));
 assert(power.update(1,1999));assert(power.state==1);
 assert(!power.update(0,2500));assert(!power.update(1,2600));assert(power.state==1);
 assert(!power.update(0,3000));assert(power.update(0,6000));assert(power.state==0);
 assert(!powerPinValid(34) && !batteryPinValid(34) && !powerPinValid(0));
 if(argc==2){std::ifstream f(argv[1]);std::string signedManifest((std::istreambuf_iterator<char>(f)),{});assert(releasePolicy(signedManifest,prefix,3,3,0,2000000,r));}
 std::cout<<"PASS: release/rollback policy, bounds, origin, replay and power debounce\n";
}
