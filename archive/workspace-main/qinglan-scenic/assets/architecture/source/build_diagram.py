from pathlib import Path
from html import escape
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import json

OUT=Path(__file__).resolve().parents[1]
FONT=TTFont('/System/Library/Fonts/STHeiti Medium.ttc',fontNumber=1)
GLYPHS=FONT.getGlyphSet(); CMAP=FONT.getBestCmap(); UPM=FONT['head'].unitsPerEm
C={'ink':'#E7EFEB','muted':'#A3BBB5','green':'#83CBB6','blue':'#69B7EA','red':'#F17B72','panel':'#203A3C','inner':'#172E31','line':'#436362','bg':'#101F22'}
parts=[]; editable=[]; measurements=[]
def add(s): parts.append(s); editable.append(s)
def rect(x,y,w,h,fill='panel',stroke='line',r=20,sw=1.5):
 add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{C.get(fill,fill)}" stroke="{C.get(stroke,stroke)}" stroke-width="{sw}"/>')
def path(d,color='green',width=3,arrow=False):
 add(f'<path d="{d}" fill="none" stroke="{C[color]}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"'+(f' marker-end="url(#{color}-arrow)"' if arrow else '')+'/>')
def text(x,y,s,size=24,color='ink',anchor='start'):
 width=sum(FONT['hmtx'][CMAP[ord(ch)]][0] for ch in s)*size/UPM
 measurements.append({'text':s,'x':x,'y':y,'width':round(width,2),'size':size})
 start=x-(width/2 if anchor=='middle' else width if anchor=='end' else 0)
 editable.append(f'<text x="{x}" y="{y}" font-family="Heiti SC, PingFang SC, sans-serif" font-size="{size}" fill="{C[color]}" text-anchor="{anchor}">{escape(s)}</text>')
 chunks=[]; cursor=0
 for ch in s:
  name=CMAP[ord(ch)]; pen=SVGPathPen(GLYPHS); GLYPHS[name].draw(pen)
  d=pen.getCommands()
  if d: chunks.append(f'<path transform="translate({cursor} 0)" d="{d}"/>')
  cursor+=FONT['hmtx'][name][0]
 parts.append(f'<g aria-label="{escape(s,quote=True)}" fill="{C[color]}" transform="translate({start:.3f} {y}) scale({size/UPM} {-size/UPM})">'+''.join(chunks)+'</g>')
def circle(x,y,r,fill): add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{C[fill]}"/>')
def icon(kind,x,y,color='green'):
 # Consistent 24 px rounded line icons, scaled to 30 px.
 d={
 'data':'M3 6 C3 2 21 2 21 6 C21 10 3 10 3 6 M3 6 V18 C3 22 21 22 21 18 V6 M3 12 C3 16 21 16 21 12',
 'service':'M4 6 H20 M4 12 H20 M4 18 H20 M8 3 V9 M16 9 V15 M10 15 V21',
 'people':'M12 11 A4 4 0 1 0 12 3 A4 4 0 1 0 12 11 M5 21 V18 C5 12 19 12 19 18 V21 M21 20 V17 C21 14 20 12 18 12',
 'monitor':'M3 4 H21 V17 H3 Z M8 21 H16 M12 17 V21 M6 11 H9 L11 7 L14 14 L16 10 H18',
 'chat':'M3 4 H21 V17 H9 L4 21 V17 H3 Z M7 9 H17 M7 13 H13',
 'shield':'M12 2 L21 6 V12 C21 18 15 21 12 23 C9 21 3 18 3 12 V6 Z M7 12 L11 16 L17 9',
 }[kind]
 add(f'<g transform="translate({x} {y}) scale(1.25)" stroke="{C[color]}" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="{d}"/></g>')

# Header.
text(64,86,'智慧景区 AI 协同运行架构',44)
text(66,128,'数据感知 · 智能研判 · 人工处置 · 反馈闭环',23,'muted')
path('M64 156 H1856','line',1)
text(64,210,'现有系统',31)
text(752,210,'我们开发的 AI 部分',31,'green')
text(1856,210,'感知 → 分析 → 行动 → 反馈',20,'muted','end')
path('M692 188 V1006','line',1)

# Shared capability bus, drawn behind the functional cards.
path('M1304 880 V844 M1020 814 V844 H1876 V416 H1856 M1588 814 V844','line',1.6)
circle(1304,844,4,'green')

# Existing system cards.
rect(136,272,472,126)
icon('data',160,294)
text(207,318,'业务数据',28)
text(160,364,'客流 · 设施状态 · 预约 · 游客内容',23,'muted')
rect(136,442,472,118)
icon('service',160,462)
text(207,486,'业务服务',28)
text(160,529,'数据查询 · 通知发布 · 任务管理',23,'muted')
rect(136,605,472,133)
icon('people',160,627)
text(207,652,'交互与人工处置',28)
text(160,695,'游客端 · 园方大屏 · 后台 · 前线人员',22,'muted')

# Main agent.
rect(752,272,1104,288,stroke='green',sw=2)
icon('monitor',780,290)
text(828,316,'运营监测 Agent',30,'green')
text(1824,315,'异常监测 / 风险研判 / 结果跟踪',21,'muted','end')
rect(784,350,448,94,fill='inner',stroke='line',r=14)
text(808,389,'异常监测与智能研判',28)
text(808,423,'客流拥堵 · 设施异常 · 运行风险',22,'muted')
rect(1312,350,512,94,fill='inner',stroke='line',r=14)
circle(1338,385,5,'red')
text(1355,394,'告警推送与处置建议',28)
text(1336,425,'风险分级 · 通知相关人员 · 跟踪处理',22,'muted')
path('M1248 397 H1293','green',3.5,True)
# Main input, main return, human action, and continuous feedback.
path('M608 335 H706 Q720 335 720 349 V383 Q720 397 734 397 H774','green',3.5,True)
text(667,312,'数据',20,'green','middle')
path('M1568 444 V483 Q1568 497 1554 497 H621','green',3.5,True)
text(1150,483,'调用业务接口 · 发布告警与建议',22,'green','middle')
text(1150,535,'送达园方大屏及相关人员',20,'muted','middle')
path('M372 560 V592','green',3.5,True)
text(393,589,'人工安排与执行',20,'green')
path('M372 738 V760 Q372 774 358 774 H96 Q82 774 82 760 V349 Q82 335 96 335 H123','green',3.5,True)
text(143,812,'处置结果回写 · 持续监测',23,'green')

# Secondary service flows.
rect(752,605,536,209)
icon('chat',780,626,'blue')
text(828,652,'游客服务 Agent',28,'blue')
path('M780 670 H1260','line',1)
text(780,705,'游客提问 → 知识检索 / 状态查询',23)
text(780,748,'游客端 ← 生成回答',25)
path('M1249 708 V735 H1138','blue',1.8,True)
text(780,790,'知识库问答 · 景点讲解 · 游览建议',21,'muted')
rect(1320,605,536,209)
icon('shield',1348,625,'blue')
text(1396,652,'内容审核 Agent',28,'blue')
path('M1348 670 H1828','line',1)
text(1348,705,'公开内容 → 智能审核',25)
text(1348,746,'违规处置 / 人工复核 → 结果回写',23)
path('M1806 696 H1825 V727','blue',1.8,True)
text(1348,790,'明确违规调用接口，疑似问题人工复核',21,'muted')

# Shared foundation.
text(752,864,'共用能力',20,'muted')
rect(752,880,1104,126,fill='inner',stroke='line',r=18)
path('M1048 902 V984 M1430 902 V984','line',1)
text(780,922,'DeepSeek 大模型',26,'green')
text(780,962,'语义理解 · 推理 · 生成',21,'muted')
text(1074,922,'知识库 / RAG',26,'green')
text(1074,962,'景区资料 · 服务规则 · 处置预案',21,'muted')
text(1456,922,'业务工具调用',26,'green')
text(1456,958,'阈值检测 · 状态查询 · 通知发布',21,'muted')
text(1456,987,'任务处理 · 审核处置 · 结果读取',19,'muted')

# Technology and restrained legend.
text(136,882,'Vue 3 · Node.js · PostgreSQL',23,'muted')
path('M136 927 H177','green',3.5,True)
text(196,935,'运营闭环',21,'muted')
path('M346 927 H387','blue',1.8,True)
text(406,935,'服务支路',21,'muted')
path('M136 973 H177','line',1.6)
text(196,981,'共用支撑',21,'muted')

DEFS='<defs>'+''.join(f'<marker id="{k}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L8 5 L1 9" fill="none" stroke="{C[k]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>' for k in ['green','blue'])+'</defs>'
HEADER='<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img"><title>智慧景区 AI 协同运行架构</title><desc>现有系统与三个智能体协作。运行数据经过异常监测与研判，调用业务接口推送告警和建议，人员安排执行，处置结果回写，形成持续监测闭环。游客问答与内容审核为两条服务支路。三个智能体共用大模型、知识库和业务工具。</desc>'+DEFS
svg=HEADER+''.join(parts)+'</svg>'
(OUT/'智慧景区-AI协同运行架构.svg').write_text(svg)
(OUT/'source'/'智慧景区-AI协同运行架构-文字可编辑.svg').write_text(HEADER+''.join(editable)+'</svg>')
(OUT/'source'/'text-metrics.json').write_text(json.dumps(measurements,ensure_ascii=False,indent=2))
print('Generated vector SVG and editable source.')
for m in measurements:
 if m['x']+m['width']>1900 and m['x']<1800: print('CHECK',m)
