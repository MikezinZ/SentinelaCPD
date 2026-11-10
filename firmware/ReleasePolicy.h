#pragma once
#include <stdint.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <cerrno>
#include <cstring>
#include <cmath>
namespace sentinela {
struct Release {
  std::string target, version, url, sha, signedText, signature;
  uint32_t sequence = 0, size = 0;
};
inline bool hexText(const std::string& s, size_t size) {
  if (s.size()!=size) return false;
  return s.find_first_not_of("0123456789abcdef") == std::string::npos;
}
inline bool decimal(const std::string& s, uint32_t& value) {
  if(s.empty() || s.size()>10 || s.find_first_not_of("0123456789")!=std::string::npos) return false;
  errno=0; char* end=nullptr; unsigned long long n=strtoull(s.c_str(),&end,10);
  if(errno || *end || n>UINT32_MAX || n==0) return false;
  value=uint32_t(n); return true;
}
inline bool releasePolicy(const std::string& text, const std::string& prefix,
                          uint32_t running, uint32_t floor, uint32_t rejected,
                          uint32_t slotSize, Release& out) {
  if(text.empty() || text.size()>4096 || text.back()!='\n' || text.find('\r')!=std::string::npos ||
     text.find('\0')!=std::string::npos || prefix.rfind("https://",0)!=0 || prefix.back()!='/') return false;
  std::vector<std::string> lines; size_t from=0;
  for(size_t i=0;i<text.size();++i) if(text[i]=='\n') {lines.push_back(text.substr(from,i-from));from=i+1;}
  if(lines.size()!=7) return false;
  Release r; r.target=lines[0];r.version=lines[1];r.sha=lines[4];r.url=lines[5];r.signature=lines[6];
  if(r.target!="sentinelacpd-esp32-v1" || r.version.empty() || r.version.size()>31 ||
     r.version.find_first_not_of("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-_")!=std::string::npos ||
     !decimal(lines[2],r.sequence) || !decimal(lines[3],r.size) || r.size>slotSize ||
     r.sequence<=running || r.sequence<floor || r.sequence==rejected || !hexText(r.sha,64) ||
     r.url.rfind(prefix,0)!=0 || r.url.find_first_of("?#@\\ \t")!=std::string::npos ||
     r.url.find("..")!=std::string::npos || r.url.find('%')!=std::string::npos ||
     r.signature.size()<512 || r.signature.size()>1024 || r.signature.size()%2 || !hexText(r.signature,r.signature.size())) return false;
  r.signedText=text.substr(0,text.size()-r.signature.size()-1); out=r; return true;
}
// Só GPIOs livres e não associados ao boot/flash/UART da montagem atual.
inline bool powerPinValid(int p) {return p==4||p==13||p==14||p==18||p==19||p==21||p==22||p==23||p==25||p==26||p==32||p==33||p==35||p==36||p==39;}
inline bool batteryPinValid(int p) {return p==32||p==33||p==35||p==36||p==39;}
struct PowerFilter {
  int state=-1, candidate=-1;
  uint32_t since=0;
  bool update(int reading,uint32_t now) {
    if(reading!=candidate){candidate=reading;since=now;}
    if(uint32_t(now-since)<3000 || state==candidate)return false;
    state=candidate;return true;
  }
};
}
