//ethers js 
import {ethers} from "../lib/ethers-5.0.min.js"
//abi 
import * as ABI from "../solidity/abi.js"

let reader = null, provider = null, signer = null;

const NETRPC = {
  5 : "https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
  250 : "https://rpc.ftm.tools"
}

const FTMSCAN = "https://api.ftmscan.com/api?module=account&action=tokennfttx&contractaddress="
const FTMAPI = "&apikey=KSTS4EH3UBX6J7BW3J31NP469P863VE2DH"

if(window.ethereum) {
  // A Web3Provider wraps a standard Web3 provider, which is
  // what Metamask injects as window.ethereum into each page
  provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  let {chainId} = await provider.getNetwork()
  reader =  NETRPC[chainId] ? new ethers.providers.JsonRpcProvider(NETRPC[chainId]) : ethers.getDefaultProvider(chainId)
  
  // Prompt user for account connections
  await provider.send("eth_requestAccounts", []);
  
  provider.on("network", (newNetwork, oldNetwork) => {
        // When a Provider makes its initial connection, it emits a "network"
        // event with a null oldNetwork along with the newNetwork. So, if the
        // oldNetwork exists, it represents a changing network
        if (oldNetwork) {
            window.location.reload();
        }
  });
  
  // The Metamask plugin also allows signing transactions to
  // send ether and pay to change state within the blockchain.
  // For this, you need the account signer...
  signer = provider.getSigner();
  console.log("Account:", await signer.getAddress());
}
else {
  provider =  ethers.getDefaultProvider()
}

//export {ERC721Buyer, ERC721FullNoBurn, ERC721CommitReveal, Stats, ShardCosmicClaim}

const CONTRACTS = {
  5 : {
    "ERC721Buyer" : "0x326F012b2f893C44a1573A07F75c64C5b2718993",
    "ERC721FullNoBurn.Gen0" : "0xB60794c2fcbc7a74672D273F80CE1CA5050435a8"
  },
  250 : {
    "ERC721Buyer" : "0xB60794c2fcbc7a74672D273F80CE1CA5050435a8",
    "ERC721FullNoBurn.Gen0" : "0x8dB24cD8451B133115588ff1350ca47aefE2CB8c",
    "ERC721FullNoBurn.GenE" : "0x693eD718D4b4420817e0A2e6e606b888DCbDb39B",
    "ERC721FullNoBurn.GenR" : "0xce761D788DF608BD21bdd59d6f4B54b2e27F25Bb",
    "ERC721CommitReveal" : "0xD124F097093F751E1620AA32f7f9A4B344eF9Be1", 
    "Stats" : "0xeEd019D0726e415526804fb3105a98323911E494", 
    "ShardCosmicClaim" : "0xAF63B2Dd717CEC099d262680dDe7692B48Ab9b34",
    "ERC721Utilities" : "0xf8f2ea668F996B45f9062BbA0FF6a5Eb31290eA5",
    "TransferCosmic" : "0x208C03B576F3bd8142A4de897C3D309176e09D93"
  }
}
const READONLY = ["ERC721FullNoBurn.Gen0","ERC721FullNoBurn.GenE","ERC721FullNoBurn.GenR","Stats","ERC721CommitReveal","ERC721Utilities"]

//id,name,nFixed,cost
const NETDATA = {
  5 : [5,"gETH",4,0.001],
  250 : [250,"FTM",0,1]
}

const NFTIDS = {
  5 : {
    "Gen0" : {
      cost : 0.001
    }
  },
  250 : {
    "Gen0" : {
      cost : 1
    },
    "GenE" : {},
    "GenR" : {}
  }
}

//load the contracts given a network name 
const loadContracts = (netId) => {
  if(!CONTRACTS[netId]) return null 

  let sig = {}, read = {};
  for(let x in CONTRACTS[netId]){
    let [id,name] = x.split(".")
    name = name || id
    
    sig[name] = new ethers.Contract(CONTRACTS[netId][x], ABI[id], signer)
    if(READONLY.includes(x)){
      read[name] = new ethers.Contract(CONTRACTS[netId][x], ABI[id], reader)
    }
  }

  return {sig,read} 
}

const EVMManager = async (app) => {
  app.eth = {
    contracts : {},
    parseEther : ethers.utils.parseEther,
    parseUnits : ethers.utils.parseUnits
  }
  const read = () => app.eth.contracts.read;
  let address = "", NFT = {};

  let {chainId, name} = await provider.getNetwork()
  app.net = {chainId, name}
  console.log(app.net)

  //get commits
  const checkCommits = (address) => {
    if(!CONTRACTS[chainId].ERC721CommitReveal)
      return

    read().ERC721CommitReveal.activeCommits(address, CONTRACTS[chainId]["ERC721FullNoBurn.GenE"]).then(res => {
      let reveal = res.toNumber()
      app.UI.main.setState({reveal})
    })
  }

  const checkRarity = async () => {
    let ids = {}
    ////https://api.ftmscan.com/api?module=account&action=tokennfttx&contractaddress=0xce761D788DF608BD21bdd59d6f4B54b2e27F25Bb&address=0x592Ad5d7618994464885fb485953a51DE119586A
    let {result = []} = await $.get(FTMSCAN+"0xce761D788DF608BD21bdd59d6f4B54b2e27F25Bb"+"&address="+address+FTMAPI)

    result.forEach(res => {
      let {tokenID, to, blockNumber} = res 
      blockNumber = Number(blockNumber)

      //sending token 
      if(ethers.utils.getAddress(to) == address){
        ids[tokenID] = blockNumber
      } 
      //receiving token 
      else {
        delete ids[tokenID]
      }
    })

    return Object.keys(ids).map(Number)
  }

  //if there is a nft balance poll for data 
  const checkNFTIds = async (id, nft) => {
    let _stats = CONTRACTS[chainId].Stats
    let _721 = nft.address
    let C = read().ERC721Utilities

    let ids = id == "GenR" ? await checkRarity() : (await C.getNFTIdBatch(_721, address)).map(bn => bn.toNumber())

    let _cosmic = (await C.getStatsOfIdBatch(_stats,"SRD.COSMIC",_721,ids))
      .map(bn => Number(ethers.utils.formatUnits(bn)))
    
    let _hash = (await C.getStatsOfIdBatch(_stats,"HASH",_721,ids)).map(bn => bn.toHexString())

    nft.owned = ids.map((id,i) => {
      let hash = _hash[i] == "0x00" ? null : _hash[i]
      let isOwned = true
      //generate and save 
      let shard = app.shard.byContract(_721,id,{hash,isOwned}) 

      return {
        id,
        cosmic : _cosmic[i],
        hash,
        _721
      }
    })

    _cosmic.forEach((val,i) => app.shard.byContract(_721,ids[i]).cosmic = val)
  }

  //check address for NFT balance
  const checkNFTBalance = async (id) => {
    let {cost = 0} = NFTIDS[chainId][id]
    let C = read()[id]

    let nft = NFT[id] = NFT[id] || {
      max : -1,
      n : -1,
      owned : [],
      address : C.address,
      cost
    }

    checkNFTIds(id,nft).catch(console.log)
  }

  //poll for address change 
  setInterval(async ()=>{
    let newAddress = await signer.getAddress()
    if(address != newAddress) {
      address = newAddress
      //load contracts again 
      app.eth.contracts = loadContracts(app.net.chainId)
      //reset NFT data 
      NFT = {}
      //UI
      let chainData = NETDATA[app.net.chainId] || [chainId,"Ξ",4,-1]
      app.UI.main.setAddress(address, chainData)
    }
    //block 
    let block = await provider.getBlockNumber()
    //get balance 
    let balance = Number(ethers.utils.formatUnits(await signer.getBalance()))

    //check if the chain exists
    if(!CONTRACTS[chainId])
      return
    
    //look for commits
    checkCommits(address)

    //check nfts 
    Object.keys(NFTIDS[chainId]).forEach(id => checkNFTBalance(id))

    //get owned shards 
    let myShards = app.shard.myShards()

    app.UI.main.setState({block, balance, NFT, myShards})
  },4000)
} 

export {EVMManager}
