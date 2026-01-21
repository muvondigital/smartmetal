@echo off
cd /d c:\Users\Administrator\Desktop\Pricer\web
echo Installing Radix UI packages... > install-log.txt
npm install @radix-ui/react-accordion @radix-ui/react-checkbox --save >> install-log.txt 2>&1
echo Installation complete >> install-log.txt
echo. >> install-log.txt
npm list @radix-ui/react-accordion >> install-log.txt 2>&1
echo. >> install-log.txt
npm list @radix-ui/react-checkbox >> install-log.txt 2>&1
