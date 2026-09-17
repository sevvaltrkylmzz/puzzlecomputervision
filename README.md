# reCAPTCHA Tarzı El Takibi Bulmaca Oyunu

Bu proje bilgisayar kamerasını kullanarak anlık fotoğraf çeken ve bunu 3x3 bir bulmacaya çeviren bir doğrulama sistemidir. Uygulama tamamen tarayıcı üzerinde çalışır ve MediaPipe ile el hareketlerini algılayarak bulmaca parçalarını sürükleyip bırakmana imkan tanır. 

### Çalıştırma

Projeyi çalıştırmak için terminalden proje klasörüne gidip yerel bir sunucu başlatman yeterli.

1. Proje klasörüne gir:
```bash
cd proje-klasoru-yolu
```

2. Terminal üzerinden sunucuyu başlat:
```bash
python3 -m http.server 3000
```

3. Tarayıcında şu adrese git:
http://localhost:3000

Bu sistemin Python ile yazılmamasının sebebi uygulamanın bir web projesi olmasıdır. Tarayıcı teknolojileriyle yazmak işlemi sunucuya göndermeden kullanıcı tarafında halleder ve gecikmeyi önler. Eğer masaüstü uygulaması olsaydı Python kullanmak performansı daha da artırabilirdi.

### El Takibi Nasıl Kullanılır
- Kameraya elini gösterdiğinde mavi bir imleç belirecek
- Bir parçayı almak için işaret parmağınla baş parmağını birleştir
- Elini basılı tutar gibi hedef parçanın üzerine götür
- Parmaklarını açtığında parçalar yer değiştirecek
